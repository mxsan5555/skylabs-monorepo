import { randomUUID } from 'crypto';
import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { ensureUniqueSlug } from '../lib/slug';
import { assignRole, serializeUser } from './user.service';
import { listActiveCategories, assertCategoryChildOf, assertVendorHasCategoryAccess } from './category.service';
import { getProductScopedOrThrow } from './product.service';
import * as mediaService from './media.service';
import type { MediaFile } from './media.service';
import * as notificationService from './notification.service';
import { Prisma, type CategoryType, type VendorStatus, type KycStatus, type DealStatus, type DealApprovalStatus } from '../generated/prisma-client';
import type {
  VendorCreateSchema,
  VendorUpdateSchema,
  VendorSelfCreateSchema,
  VendorSelfUpdateSchema,
  BranchCreateSchema,
  BranchUpdateSchema,
  DealCreateSchema,
  DealUpdateSchema,
  TherapistCreateSchema,
  TherapistUpdateSchema,
  TherapistPackageCreateSchema,
  TherapistPackageUpdateSchema,
} from '../schemas/vendor.schema';

type VendorCreateInput = z.infer<typeof VendorCreateSchema>;
type VendorUpdateInput = z.infer<typeof VendorUpdateSchema>;
type VendorSelfCreateInput = z.infer<typeof VendorSelfCreateSchema>;
type VendorSelfUpdateInput = z.infer<typeof VendorSelfUpdateSchema>;
type BranchCreateInput = z.infer<typeof BranchCreateSchema>;
type BranchUpdateInput = z.infer<typeof BranchUpdateSchema>;
type DealCreateInput = z.infer<typeof DealCreateSchema>;
type DealUpdateInput = z.infer<typeof DealUpdateSchema>;
type TherapistCreateInput = z.infer<typeof TherapistCreateSchema>;
type TherapistUpdateInput = z.infer<typeof TherapistUpdateSchema>;
type TherapistPackageCreateInput = z.infer<typeof TherapistPackageCreateSchema>;
type TherapistPackageUpdateInput = z.infer<typeof TherapistPackageUpdateSchema>;

/** Fields that, once edited after a KYC rejection, mean the vendor is resubmitting. */
const KYC_RELEVANT_FIELDS = ['gstNumber', 'panNumber', 'businessRegistrationNumber', 'kycDocuments'] as const;

/** Minimal, non-sensitive summary of the linked User — no session/token/auth data — shown as
 *  "Vendor Account" in the admin UI so it's unambiguous which login owns a given vendor. */
const OWNER_SUMMARY_SELECT = {
  select: {
    id: true,
    name: true,
    email: true,
    phone: true,
    status: true,
    roles: { select: { role: { select: { id: true, key: true, name: true } } } },
  },
} as const;

/** Declared outside the various Vendor `include` objects' own `as const` (and explicitly typed,
 *  not inferred) so this stays the mutable array Prisma's generated types expect — same gotcha
 *  as DEAL_PACKAGE_ORDER_BY/DEAL_IMAGE_ORDER_BY further down this file. */
const VENDOR_IMAGE_ORDER_BY: Prisma.VendorImageOrderByWithRelationInput[] = [
  { isPrimary: 'desc' },
  { sortOrder: 'asc' },
];
/** Shared by every Vendor read/write include below — `getVendorByOwnerUserId`/`createSelfVendor`/
 *  `updateSelfVendor` used to each have their own bespoke include (or none at all), which is
 *  exactly the kind of per-endpoint drift that silently left a media include out of one read
 *  path in an earlier round of this same work (see `listDeals`'s equivalent gap) — one shared
 *  const here instead. */
const VENDOR_MEDIA_INCLUDE = { mediaImages: { orderBy: VENDOR_IMAGE_ORDER_BY }, mediaVideo: true, documents: true } as const;

/** Standard `include` for any Vendor read/write that should carry its linked-owner summary + branch count. */
const OWNER_INCLUDE = { _count: { select: { branches: true } }, owner: OWNER_SUMMARY_SELECT, ...VENDOR_MEDIA_INCLUDE } as const;

function heuristicInitialStatus(input: { gstNumber?: string; panNumber?: string }): VendorStatus {
  return input.gstNumber && input.panNumber ? 'PENDING_VERIFICATION' : 'PROFILE_INCOMPLETE';
}

interface RawOwner {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  roles: { role: { id: string; key: string; name: string } }[];
}

/** Flattens `owner.roles` from Prisma's join shape (`[{ role: {...} }]`) to `[{...}]` —
 *  matches the shape `userService.listUsers`/`serializeUser` already returns, so the
 *  frontend's "Vendor Account" display and "select existing user" search share one type. */
function serializeVendor<T extends { owner: RawOwner | null }>(vendor: T) {
  return {
    ...vendor,
    owner: vendor.owner ? { ...vendor.owner, roles: vendor.owner.roles.map((r) => r.role) } : null,
  };
}

// ─── Vendor: admin surface ───────────────────────────────────────────────────

export async function listVendors(opts: {
  page: number;
  pageSize: number;
  search?: string;
  status?: VendorStatus;
}) {
  const where = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.search
      ? {
          OR: [
            { businessName: { contains: opts.search, mode: 'insensitive' as const } },
            { ownerName: { contains: opts.search, mode: 'insensitive' as const } },
            { businessEmail: { contains: opts.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.vendor.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: OWNER_INCLUDE,
    }),
    prisma.vendor.count({ where }),
  ]);
  return { items: items.map(serializeVendor), total };
}

export async function getVendorOrThrow(id: string) {
  const vendor = await prisma.vendor.findUnique({ where: { id }, include: OWNER_INCLUDE });
  if (!vendor) throw new ApiError('NOT_FOUND', 'Vendor not found');
  return serializeVendor(vendor);
}

/**
 * Validates a User is a legitimate link target for a Vendor: exists (and isn't soft-deleted),
 * is active, and doesn't already own a different vendor profile. `excludeVendorId` lets
 * `updateVendor` re-save a vendor's own existing `ownerUserId` without tripping the
 * already-owns-a-vendor check against itself.
 */
async function assertOwnerUserAvailable(ownerUserId: string | undefined, excludeVendorId?: string) {
  if (!ownerUserId) return;
  const user = await prisma.user.findFirst({ where: { id: ownerUserId, deletedAt: null } });
  if (!user) throw new ApiError('VALIDATION_ERROR', 'Selected user does not exist');
  if (user.status !== 'active') {
    throw new ApiError('VALIDATION_ERROR', 'Selected user is not eligible to become a vendor (inactive or blocked)');
  }
  const existing = await prisma.vendor.findUnique({ where: { ownerUserId } });
  if (existing && existing.id !== excludeVendorId) {
    throw new ApiError('CONFLICT', 'This user is already associated with a vendor');
  }
}

/** Grants the existing `vendor` role to a newly-linked owner, preserving whatever roles they
 *  already had — idempotent (upsert), and the only way a User gains vendor-portal access. */
async function ensureVendorRoleAssigned(userId: string) {
  const vendorRole = await prisma.role.findUnique({ where: { key: 'vendor' } });
  if (!vendorRole) return; // defensive — seed.ts always creates the six system roles
  await assignRole(userId, vendorRole.id);
}

/**
 * The "Add Vendor → Select Existing User" search — filters out ineligible users server-side
 * (never trust the frontend to have already excluded them): must be active, and must not
 * already own another vendor (`vendorProfile: null`, via the existing back-relation). This is
 * a distinct query from `userService.listUsers` (which the RBAC Users screen needs to show
 * every user regardless of vendor eligibility) — reuses its exact serialization via the
 * exported `serializeUser`, so there's one definition of the User summary shape, not two.
 */
export async function searchEligibleOwnerCandidates(query: string | undefined, page: number, pageSize: number) {
  const where = {
    deletedAt: null,
    status: 'active' as const,
    vendorProfile: null,
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: 'insensitive' as const } },
            { email: { contains: query, mode: 'insensitive' as const } },
            { phone: { contains: query, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { roles: { include: { role: true } } },
    }),
    prisma.user.count({ where }),
  ]);
  return { items: items.map(serializeUser), total };
}

export async function createVendor(input: VendorCreateInput, createdByUserId: string) {
  await assertOwnerUserAvailable(input.ownerUserId);
  // Double-submit guard — previously this only had protection via assertOwnerUserAvailable's
  // "already associated with a vendor" check, and only when `ownerUserId` was provided (the
  // admin pipeline's Step 1 can also persist a Vendor with no owner yet — see this function's
  // slug-derivation comment below). Same window-based idempotency as createTherapist below,
  // keyed on the same admin/self-service caller submitting the same businessName again within
  // the window, so a rapid double-click doesn't create two draft Vendor rows.
  const recentDuplicate = await prisma.vendor.findFirst({
    where: {
      createdByUserId,
      businessName: input.businessName ?? null,
      createdAt: { gte: new Date(Date.now() - DUPLICATE_SUBMIT_WINDOW_MS) },
    },
    orderBy: { createdAt: 'desc' },
    include: OWNER_INCLUDE,
  });
  if (recentDuplicate) return serializeVendor(recentDuplicate);
  if (input.ownerUserId) await ensureVendorRoleAssigned(input.ownerUserId);
  // Generated up front (rather than relying on the schema's `@default(uuid())`) so it's
  // available as ensureUniqueSlug's id-based fallback/placeholder in the same insert — see
  // that function's doc comment for why a plain businessName-derived slug isn't always enough.
  const id = randomUUID();
  const slug = await ensureUniqueSlug(input.businessName || id, id, (candidate) =>
    prisma.vendor.findUnique({ where: { slug: candidate } }).then(Boolean),
  );
  const vendor = await prisma.vendor.create({
    data: {
      ...input,
      id,
      slug,
      status: heuristicInitialStatus(input),
      createdByUserId,
    } as Prisma.VendorUncheckedCreateInput,
    include: OWNER_INCLUDE,
  });
  return serializeVendor(vendor);
}

export async function updateVendor(id: string, input: VendorUpdateInput) {
  const existing = await getVendorOrThrow(id);
  if ('ownerUserId' in input) await assertOwnerUserAvailable(input.ownerUserId, id);
  if (input.ownerUserId) await ensureVendorRoleAssigned(input.ownerUserId);
  // The admin-create pipeline's Step 1 persists a Vendor before any businessName is known (see
  // createVendor above), so its slug starts out id-derived rather than name-derived. The FIRST
  // time a real businessName arrives via update, upgrade the slug to reflect it — but never
  // again after that, so a vendor's public `/vendor/:slug` URL never unexpectedly changes once
  // it's been derived from a real name.
  const data: Prisma.VendorUncheckedUpdateInput = { ...input } as Prisma.VendorUncheckedUpdateInput;
  if (!existing.businessName && input.businessName) {
    data.slug = await ensureUniqueSlug(input.businessName, id, (candidate) =>
      prisma.vendor.findUnique({ where: { slug: candidate } }).then((v) => Boolean(v) && v!.id !== id),
    );
  }
  const vendor = await prisma.vendor.update({
    where: { id },
    data,
    include: OWNER_INCLUDE,
  });
  return serializeVendor(vendor);
}

/** Approve jumps straight to ACTIVE — no pointless extra "approved but not active" click. */
export async function approveVendor(id: string) {
  await getVendorOrThrow(id);
  const vendor = await prisma.vendor.update({ where: { id }, data: { status: 'ACTIVE', statusReason: null }, include: OWNER_INCLUDE });
  return serializeVendor(vendor);
}

export async function rejectVendor(id: string, reason: string) {
  await getVendorOrThrow(id);
  const vendor = await prisma.vendor.update({ where: { id }, data: { status: 'REJECTED', statusReason: reason }, include: OWNER_INCLUDE });
  return serializeVendor(vendor);
}

/** Generic activate/deactivate/suspend for an already-approved vendor (not the initial approve/reject transition). */
export async function setVendorStatus(id: string, status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED', reason?: string) {
  await getVendorOrThrow(id);
  const vendor = await prisma.vendor.update({ where: { id }, data: { status, statusReason: reason ?? null }, include: OWNER_INCLUDE });
  return serializeVendor(vendor);
}

export async function reviewKyc(id: string, kycStatus: Extract<KycStatus, 'VERIFIED' | 'REJECTED'>, rejectionReason?: string) {
  await getVendorOrThrow(id);
  const vendor = await prisma.vendor.update({
    where: { id },
    data: { kycStatus, kycRejectionReason: kycStatus === 'REJECTED' ? rejectionReason : null },
    include: OWNER_INCLUDE,
  });
  return serializeVendor(vendor);
}

/** Superadmin-only hard delete. `Branch`/`Deal`/`Therapist`/`Product`/`VendorDocument`/
 *  `VendorImage`/`VendorVideo`/`VendorCategoryAccess` all cascade away with the vendor
 *  (`onDelete: Cascade` on their `vendor` relation), but `Order`/`OrderItem`'s `vendor` relation
 *  has no `onDelete` (Postgres default = restrict) — a vendor with any real order history can
 *  never be hard-deleted, only deactivated/suspended via `setVendorStatus`. Mirrors this
 *  codebase's own established "catch a known Prisma error code, translate to a specific
 *  ApiError" convention (see the P2002-to-CONFLICT catches elsewhere in this file). */
export async function deleteVendor(id: string) {
  await getVendorOrThrow(id);
  try {
    await prisma.vendor.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw new ApiError('CONFLICT', 'Cannot delete this vendor because it has existing orders or other records referencing it. Deactivate it instead.');
    }
    throw err;
  }
}

// ─── Vendor: self-service surface ────────────────────────────────────────────

/** Never throws — callers decide whether "no vendor yet" means 404 or "show onboarding." */
export async function getVendorByOwnerUserId(ownerUserId: string) {
  return prisma.vendor.findUnique({
    where: { ownerUserId },
    include: { _count: { select: { branches: true } }, ...VENDOR_MEDIA_INCLUDE },
  });
}

export async function getMyVendorOrThrow(ownerUserId: string) {
  const vendor = await getVendorByOwnerUserId(ownerUserId);
  if (!vendor) throw new ApiError('NOT_FOUND', 'Complete your business profile first');
  return vendor;
}

export async function createSelfVendor(ownerUserId: string, input: VendorSelfCreateInput) {
  const existing = await prisma.vendor.findUnique({ where: { ownerUserId } });
  if (existing) throw new ApiError('CONFLICT', 'You already have a vendor profile');
  const id = randomUUID();
  const slug = await ensureUniqueSlug(input.businessName, id, (candidate) =>
    prisma.vendor.findUnique({ where: { slug: candidate } }).then(Boolean),
  );
  return prisma.vendor.create({
    data: {
      ...input,
      id,
      slug,
      ownerUserId,
      status: heuristicInitialStatus(input),
    } as Prisma.VendorUncheckedCreateInput,
    include: VENDOR_MEDIA_INCLUDE,
  });
}

export async function updateSelfVendor(ownerUserId: string, input: VendorSelfUpdateInput) {
  const vendor = await getMyVendorOrThrow(ownerUserId);
  const touchesKyc = KYC_RELEVANT_FIELDS.some((field) => field in input);
  const data: VendorSelfUpdateInput & { kycStatus?: KycStatus; kycRejectionReason?: string | null } = { ...input };
  if (touchesKyc && vendor.kycStatus === 'REJECTED') {
    data.kycStatus = 'PENDING';
    data.kycRejectionReason = null;
  }
  return prisma.vendor.update({
    where: { id: vendor.id },
    data: data as Prisma.VendorUncheckedUpdateInput,
    include: VENDOR_MEDIA_INCLUDE,
  });
}

const REQUIRED_FOR_SUBMISSION: { key: keyof Awaited<ReturnType<typeof getMyVendorOrThrow>>; label: string }[] = [
  { key: 'businessName', label: 'Business name' },
  { key: 'businessEmail', label: 'Business email' },
  { key: 'businessPhone', label: 'Business phone' },
  { key: 'ownerFirstName', label: 'First name' },
  { key: 'ownerLastName', label: 'Last name' },
  { key: 'ownerMobile', label: 'Phone number' },
  { key: 'ownerEmail', label: 'Email' },
  { key: 'address', label: 'Address 1' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'pincode', label: 'PIN code' },
  { key: 'latitude', label: 'Latitude' },
  { key: 'longitude', label: 'Longitude' },
];

/** At least one of GST/PAN/Aadhaar uploaded — real `VendorDocument` rows are the authoritative
 *  check (see that model's schema doc comment); the legacy `kycDocuments` JSON regex is kept
 *  ONLY as a fallback so a vendor onboarded before real file upload existed doesn't regress.
 *  The onboarding wizard's Step 1 gate moves this same check up client-side (disables
 *  "Continue"/"Create Vendor" until satisfied); this is the server-side confirmation. */
async function hasMinimumKycDocument(vendorId: string, legacyKycDocuments: unknown): Promise<boolean> {
  const realDocumentCount = await prisma.vendorDocument.count({ where: { vendorId } });
  if (realDocumentCount > 0) return true;
  if (!Array.isArray(legacyKycDocuments)) return false;
  return legacyKycDocuments.some(
    (doc) => doc && typeof doc === 'object' && typeof (doc as { type?: unknown }).type === 'string' &&
      /gst|pan|aadhaar/i.test((doc as { type: string }).type) && Boolean((doc as { url?: unknown }).url),
  );
}

/**
 * Onboarding wizard Step 6's completeness gate — extends the original scalar-field checklist
 * with the new direct-category-access requirements: at least one branch (with a state set, so
 * the vendor has at least one real operating location), at least one business module enabled,
 * and every enabled module backed by at least one granted category (a module checked with zero
 * categories is a valid mid-wizard state, but never a submittable one).
 */
export async function submitForVerification(ownerUserId: string) {
  const vendor = await getMyVendorOrThrow(ownerUserId);
  if (vendor.status !== 'PROFILE_INCOMPLETE' && vendor.status !== 'REJECTED') {
    throw new ApiError('CONFLICT', `Cannot submit a vendor with status ${vendor.status}`);
  }
  const missing = REQUIRED_FOR_SUBMISSION.filter((f) => !vendor[f.key]).map((f) => f.label);
  if (!(await hasMinimumKycDocument(vendor.id, vendor.kycDocuments))) {
    missing.push('At least one KYC document (GST, PAN, or Aadhaar)');
  }

  const branches = await prisma.branch.findMany({ where: { vendorId: vendor.id }, select: { state: true } });
  if (branches.length === 0) {
    missing.push('At least one branch');
  } else if (!branches.some((b) => Boolean(b.state))) {
    missing.push('At least one branch with a state set');
  }

  const enabledModules: CategoryType[] = [
    ...(vendor.offersService ? (['SERVICE'] as const) : []),
    ...(vendor.offersProduct ? (['PRODUCT'] as const) : []),
    ...(vendor.offersTherapy ? (['THERAPY'] as const) : []),
  ];
  if (enabledModules.length === 0) {
    missing.push('At least one business module (Service, Product, or Therapy)');
  } else {
    const grants = await prisma.vendorCategoryAccess.findMany({
      where: { vendorId: vendor.id },
      include: { category: { select: { type: true } } },
    });
    const grantedTypes = new Set(grants.map((g) => g.category.type));
    for (const type of enabledModules) {
      if (!grantedTypes.has(type)) {
        missing.push(`At least one granted ${type.charAt(0)}${type.slice(1).toLowerCase()} category`);
      }
    }
  }

  if (missing.length > 0) {
    throw new ApiError('VALIDATION_ERROR', 'Profile is incomplete', { missing });
  }

  // Runs in the same transaction as the status flip so a rolled-back submission can never leave a
  // stray notification behind (mirrors createDeal's own notifySuperAdmins call-site pattern). The
  // precondition above (status must currently be PROFILE_INCOMPLETE/REJECTED) means this function
  // can only ever succeed once per submission cycle, which is also the notification's own
  // duplicate-prevention — a vendor editing/saving again while PENDING_VERIFICATION never reaches
  // this code path again.
  return prisma.$transaction(async (tx) => {
    const updated = await tx.vendor.update({
      where: { id: vendor.id },
      data: { status: 'PENDING_VERIFICATION', statusReason: null },
    });
    await notificationService.notifySuperAdmins(tx, {
      type: 'VENDOR_PENDING_APPROVAL',
      title: 'Vendor Profile Pending Approval',
      message: `${vendor.businessName ?? 'A vendor'} completed their profile and is waiting for approval.`,
      entityType: 'VENDOR',
      entityId: vendor.id,
      metadata: { vendorId: vendor.id },
    });
    return updated;
  });
}

/**
 * Mirrors the admin onboarding pipeline's steps 1-6 one-to-one (step 7, Review, is a summary
 * of these — not its own data section). Drives both the self-service "Profile Completion"
 * checklist and the pipeline's step lock/unlock state, so there is exactly one definition of
 * "is this section done" for the whole Vendor feature.
 */
const COMPLETION_SECTIONS: { key: string; label: string; check: (v: Record<string, unknown>) => boolean }[] = [
  { key: 'user', label: 'Vendor User', check: (v) => Boolean(v.ownerUserId) },
  { key: 'business', label: 'Business Details', check: (v) => Boolean(v.businessName && v.businessEmail && v.businessPhone) },
  { key: 'owner', label: 'Personal Information', check: (v) => Boolean(v.ownerFirstName && v.ownerLastName && v.ownerMobile && v.ownerEmail) },
  { key: 'address', label: 'Registered Address', check: (v) => Boolean(v.address && v.city && v.state && v.pincode && v.latitude != null && v.longitude != null) },
  { key: 'kyc', label: 'KYC Documents', check: (v) => Array.isArray(v.documents) && (v.documents as unknown[]).length > 0 },
  { key: 'bank', label: 'Bank Details', check: (v) => Boolean(v.bankAccountHolder && v.bankAccountNumber && v.bankIfsc) },
];

export function computeProfileCompletion(vendor: Record<string, unknown>) {
  const sections = COMPLETION_SECTIONS.map((s) => ({ key: s.key, label: s.label, complete: s.check(vendor) }));
  const percent = Math.round((sections.filter((s) => s.complete).length / sections.length) * 100);
  return { percent, sections };
}

// ─── Cross-vendor admin listings (for the sidebar's standalone Branches/Deals pages) ─────────

export async function listAllBranches(opts: { page: number; pageSize: number; search?: string }) {
  const where = opts.search
    ? {
        OR: [
          { name: { contains: opts.search, mode: 'insensitive' as const } },
          { vendor: { businessName: { contains: opts.search, mode: 'insensitive' as const } } },
        ],
      }
    : {};
  const [items, total] = await Promise.all([
    prisma.branch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: { vendor: { select: { id: true, businessName: true } }, _count: { select: { deals: true } } },
    }),
    prisma.branch.count({ where }),
  ]);
  return { items, total };
}

export async function listAllDeals(opts: { page: number; pageSize: number; search?: string }) {
  const where = opts.search
    ? {
        OR: [
          { title: { contains: opts.search, mode: 'insensitive' as const } },
          { vendor: { businessName: { contains: opts.search, mode: 'insensitive' as const } } },
          { branch: { name: { contains: opts.search, mode: 'insensitive' as const } } },
        ],
      }
    : {};
  const [items, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: {
        vendor: { select: { id: true, businessName: true } },
        branch: { select: { id: true, name: true } },
        // Reuses the same OFFERING_INCLUDE shape (packages + media) every single-vendor deal
        // read already uses — the cross-vendor Deals list needed these too for a "From ₹X"
        // package summary and a thumbnail image, previously omitted here.
        ...OFFERING_INCLUDE,
      },
    }),
    prisma.deal.count({ where }),
  ]);
  return { items, total };
}

export async function listAllTherapists(opts: { page: number; pageSize: number; search?: string }) {
  const where = opts.search
    ? {
        OR: [
          { personName: { contains: opts.search, mode: 'insensitive' as const } },
          { therapistType: { contains: opts.search, mode: 'insensitive' as const } },
          { vendor: { businessName: { contains: opts.search, mode: 'insensitive' as const } } },
        ],
      }
    : {};
  const [items, total] = await Promise.all([
    prisma.therapist.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: {
        vendor: { select: { id: true, businessName: true } },
        branch: { select: { id: true, name: true } },
        _count: { select: { packages: true } },
      },
    }),
    prisma.therapist.count({ where }),
  ]);
  return { items, total };
}

// ─── Branch (shared by admin `:vendorId` path and self-derived vendorId) ─────

export async function listBranches(vendorId: string) {
  return prisma.branch.findMany({
    where: { vendorId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { deals: true } } },
  });
}

/** 404 if the branch doesn't exist at all; 403 if it exists but belongs to a different vendor. */
export async function getBranchScopedOrThrow(vendorId: string, branchId: string) {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) throw new ApiError('NOT_FOUND', 'Branch not found');
  if (branch.vendorId !== vendorId) throw new ApiError('FORBIDDEN', 'This branch does not belong to your vendor');
  return branch;
}

export async function createBranch(vendorId: string, input: BranchCreateInput) {
  await getVendorOrThrow(vendorId);
  return prisma.branch.create({ data: { ...input, vendorId } as Prisma.BranchUncheckedCreateInput });
}

export async function updateBranch(vendorId: string, branchId: string, input: BranchUpdateInput) {
  await getBranchScopedOrThrow(vendorId, branchId);
  return prisma.branch.update({ where: { id: branchId }, data: input as Prisma.BranchUncheckedUpdateInput });
}

export async function setBranchStatus(vendorId: string, branchId: string, isActive: boolean) {
  await getBranchScopedOrThrow(vendorId, branchId);
  return prisma.branch.update({ where: { id: branchId }, data: { isActive } });
}

// ─── Therapist (shared by self-derived vendorId, mirrors Branch's scoping pattern) ───────────

/** Same "declared outside the `as const` object" reasoning as DEAL_IMAGE_ORDER_BY — used only by
 *  the actual list/detail reads below, not by getTherapistScopedOrThrow (a pure ownership check,
 *  called from every therapist-nested mutation, where the extra join would be dead weight). */
const THERAPIST_IMAGE_ORDER_BY: Prisma.TherapistImageOrderByWithRelationInput[] = [
  { isPrimary: 'desc' },
  { sortOrder: 'asc' },
];
const THERAPIST_MEDIA_INCLUDE = {
  mediaImages: { orderBy: THERAPIST_IMAGE_ORDER_BY },
  mediaVideo: true,
} as const;

export async function listTherapists(vendorId: string, branchId: string) {
  await getBranchScopedOrThrow(vendorId, branchId);
  return prisma.therapist.findMany({ where: { branchId }, orderBy: { createdAt: 'desc' }, include: THERAPIST_MEDIA_INCLUDE });
}

/**
 * All therapists for a vendor (active AND inactive — unlike the self-service/public reads,
 * admin should see the full picture), across every branch, for the admin vendor detail page.
 * No ownership-resolution needed: the `vendors:view` permission check on the route is the gate.
 */
export async function listVendorTherapistsForAdmin(vendorId: string) {
  return prisma.therapist.findMany({
    where: { vendorId },
    include: { branch: { select: { id: true, name: true } }, ...THERAPIST_MEDIA_INCLUDE },
    orderBy: { createdAt: 'desc' },
  });
}

/** 404 if the therapist doesn't exist at all; FORBIDDEN if it exists but belongs to a different
 *  vendor — same discipline as getBranchScopedOrThrow/getDealScopedOrThrow. */
export async function getTherapistScopedOrThrow(vendorId: string, therapistId: string) {
  const therapist = await prisma.therapist.findUnique({ where: { id: therapistId } });
  if (!therapist) throw new ApiError('NOT_FOUND', 'Therapist not found');
  if (therapist.vendorId !== vendorId) throw new ApiError('FORBIDDEN', 'This therapist does not belong to your vendor');
  return therapist;
}

/** A rapid double-click/double-submit sends two near-identical create requests before the
 *  first one's response reaches the frontend's own submit-guard — deliberately NOT solved with
 *  a DB `@@unique` on `(vendorId, branchId, therapistType, personName)`, since two different real
 *  people can legitimately share a name at the same branch, and that would permanently reject a
 *  legitimate second therapist, not just the accidental duplicate. Instead: if an identical
 *  request created a row in the last 10 seconds, treat this as the same submission and return
 *  that row rather than creating another — mirrors payment.service.ts's own
 *  find-recent-then-reuse idempotency pattern rather than inventing a new mechanism. */
const DUPLICATE_SUBMIT_WINDOW_MS = 10_000;

export async function createTherapist(vendorId: string, branchId: string, input: TherapistCreateInput) {
  await getBranchScopedOrThrow(vendorId, branchId);
  const recentDuplicate = await prisma.therapist.findFirst({
    where: {
      vendorId,
      branchId,
      therapistType: input.therapistType,
      personName: input.personName,
      createdAt: { gte: new Date(Date.now() - DUPLICATE_SUBMIT_WINDOW_MS) },
    },
    orderBy: { createdAt: 'desc' },
    include: THERAPIST_MEDIA_INCLUDE,
  });
  if (recentDuplicate) return recentDuplicate;
  if (input.specializationCategoryId) {
    await assertVendorHasCategoryAccess(vendorId, input.specializationCategoryId, 'THERAPY');
  }
  return prisma.therapist.create({
    data: { ...input, vendorId, branchId } as Prisma.TherapistUncheckedCreateInput,
    include: THERAPIST_MEDIA_INCLUDE,
  });
}

export async function updateTherapist(vendorId: string, therapistId: string, input: TherapistUpdateInput) {
  await getTherapistScopedOrThrow(vendorId, therapistId);
  if (input.specializationCategoryId) {
    await assertVendorHasCategoryAccess(vendorId, input.specializationCategoryId, 'THERAPY');
  }
  return prisma.therapist.update({
    where: { id: therapistId },
    data: input as Prisma.TherapistUncheckedUpdateInput,
    include: THERAPIST_MEDIA_INCLUDE,
  });
}

/** Soft-disable — the everyday way to take a Therapist off the storefront without losing the row. */
export async function setTherapistStatus(vendorId: string, therapistId: string, isActive: boolean) {
  await getTherapistScopedOrThrow(vendorId, therapistId);
  return prisma.therapist.update({ where: { id: therapistId }, data: { isActive } });
}

/** Superadmin-only hard delete. `CartItem`/`OrderItem`'s `therapist` relation has no `onDelete`
 *  (Postgres default = restrict), so a Therapist currently sitting in any real order or active
 *  cart can never be hard-deleted — Postgres itself blocks it with a clean P2003, translated here
 *  to a specific CONFLICT (never silently orphans a historical order line). */
export async function deleteTherapist(vendorId: string, therapistId: string) {
  await getTherapistScopedOrThrow(vendorId, therapistId);
  try {
    await prisma.therapist.delete({ where: { id: therapistId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw new ApiError('CONFLICT', 'Cannot delete this therapist because it has existing orders or carts referencing it. Deactivate it instead.');
    }
    throw err;
  }
}

// ─── TherapistPackage (a therapist's own duration/price menu — independent of any Deal) ──

export async function listTherapistPackages(vendorId: string, therapistId: string) {
  await getTherapistScopedOrThrow(vendorId, therapistId);
  return prisma.therapistPackage.findMany({
    where: { therapistId },
    orderBy: [{ sortOrder: 'asc' }, { durationMinutes: 'asc' }],
  });
}

/** 404 if the package doesn't exist; FORBIDDEN if it exists but its therapist doesn't belong to
 *  the caller's vendor OR belongs to a different therapist than the route's own :therapistId —
 *  same discipline as getTherapistScopedOrThrow. */
async function getTherapistPackageScopedOrThrow(vendorId: string, therapistId: string, packageId: string) {
  await getTherapistScopedOrThrow(vendorId, therapistId);
  const pkg = await prisma.therapistPackage.findUnique({ where: { id: packageId } });
  if (!pkg) throw new ApiError('NOT_FOUND', 'Package not found');
  if (pkg.therapistId !== therapistId) throw new ApiError('FORBIDDEN', 'This package does not belong to this therapist');
  return pkg;
}

export async function createTherapistPackage(vendorId: string, therapistId: string, input: TherapistPackageCreateInput) {
  await getTherapistScopedOrThrow(vendorId, therapistId);
  try {
    return await prisma.therapistPackage.create({
      data: { ...input, therapistId } as Prisma.TherapistPackageUncheckedCreateInput,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ApiError('CONFLICT', 'This therapist already has a package for this duration');
    }
    throw err;
  }
}

export async function updateTherapistPackage(
  vendorId: string,
  therapistId: string,
  packageId: string,
  input: TherapistPackageUpdateInput,
) {
  await getTherapistPackageScopedOrThrow(vendorId, therapistId, packageId);
  try {
    return await prisma.therapistPackage.update({
      where: { id: packageId },
      data: input as Prisma.TherapistPackageUncheckedUpdateInput,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ApiError('CONFLICT', 'This therapist already has a package for this duration');
    }
    throw err;
  }
}

/** Real delete (unlike Therapist) — see TherapistPackage's own schema doc comment for why this
 *  is safe: CartItem/OrderItem never reference this row by id at read time, only a nullable
 *  traceability pointer, and its price/duration are already immutably snapshotted at cart/order
 *  time. */
export async function deleteTherapistPackage(vendorId: string, therapistId: string, packageId: string) {
  await getTherapistPackageScopedOrThrow(vendorId, therapistId, packageId);
  await prisma.therapistPackage.delete({ where: { id: packageId } });
}

// ─── Therapist media (shared upload system — see media.service.ts's doc comment; ownership
// stays here, mechanics live there, same layering as Deal media above) ───────────────────

export async function addTherapistImage(vendorId: string, therapistId: string, file: MediaFile) {
  await getTherapistScopedOrThrow(vendorId, therapistId);
  return mediaService.addImage('therapist', therapistId, file);
}

export async function deleteTherapistImage(vendorId: string, therapistId: string, imageId: string) {
  await getTherapistScopedOrThrow(vendorId, therapistId);
  return mediaService.deleteImage('therapist', therapistId, imageId);
}

export async function reorderTherapistImages(vendorId: string, therapistId: string, orderedImageIds: string[]) {
  await getTherapistScopedOrThrow(vendorId, therapistId);
  return mediaService.reorderImages('therapist', therapistId, orderedImageIds);
}

export async function setTherapistPrimaryImage(vendorId: string, therapistId: string, imageId: string) {
  await getTherapistScopedOrThrow(vendorId, therapistId);
  return mediaService.setPrimaryImage('therapist', therapistId, imageId);
}

export async function replaceTherapistVideo(vendorId: string, therapistId: string, file: MediaFile) {
  await getTherapistScopedOrThrow(vendorId, therapistId);
  return mediaService.replaceVideo('therapist', therapistId, file);
}

export async function deleteTherapistVideo(vendorId: string, therapistId: string) {
  await getTherapistScopedOrThrow(vendorId, therapistId);
  return mediaService.deleteVideo('therapist', therapistId);
}

// ─── Customers (derived from Order — no dedicated table) ─────────────────────

/**
 * Distinct customers who have at least one Order with this vendor, for the vendor-facing
 * "Customers" screen. Deliberately NOT a new Prisma model/migration — grouped off the existing
 * Order rows and merged in application code, then the *distinct-customer* list (not the raw Order
 * rows) is paginated and hydrated with each User's display fields. Same minimal, non-sensitive
 * customer summary as ORDER_INCLUDE in order.service.ts (id/name/phone/email only).
 *
 * Orders are grouped via OrderItem.vendorId, not Order.vendorId (the "primary vendor" only) —
 * a multi-vendor order where this vendor holds a non-primary line item must still surface that
 * customer here. `orderCount` counts distinct Orders touching this vendor, not raw item rows
 * (a multi-item order for this same vendor still counts once) — every purchase kind (Deal,
 * Product, Therapist) is an OrderItem, so this one count already covers all of them; there is no
 * separate booking count anymore.
 */
export async function listMyCustomers(vendorId: string, opts: { page: number; pageSize: number }) {
  const vendorOrderItems = await prisma.orderItem.findMany({
    where: { vendorId },
    select: { orderId: true, order: { select: { customerId: true, createdAt: true } } },
  });

  const distinctOrders = new Map<string, { customerId: string; createdAt: Date }>();
  for (const item of vendorOrderItems) {
    if (!distinctOrders.has(item.orderId)) {
      distinctOrders.set(item.orderId, { customerId: item.order.customerId, createdAt: item.order.createdAt });
    }
  }
  const orderGroups = new Map<string, { count: number; maxCreatedAt: Date }>();
  for (const { customerId, createdAt } of distinctOrders.values()) {
    const g = orderGroups.get(customerId);
    if (g) {
      g.count += 1;
      if (createdAt > g.maxCreatedAt) g.maxCreatedAt = createdAt;
    } else {
      orderGroups.set(customerId, { count: 1, maxCreatedAt: createdAt });
    }
  }

  const total = orderGroups.size;
  const ranked = Array.from(orderGroups.entries())
    .map(([customerId, stats]) => ({ customerId, orderCount: stats.count, lastActivityAt: stats.maxCreatedAt }))
    .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
  const page = ranked.slice((opts.page - 1) * opts.pageSize, (opts.page - 1) * opts.pageSize + opts.pageSize);

  const users = await prisma.user.findMany({
    where: { id: { in: page.map((p) => p.customerId) } },
    select: { id: true, name: true, phone: true, email: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  const items = page.map((p) => {
    const user = userById.get(p.customerId);
    return {
      id: p.customerId,
      name: user?.name ?? null,
      phone: user?.phone ?? null,
      email: user?.email ?? null,
      orderCount: p.orderCount,
      lastActivityAt: p.lastActivityAt,
    };
  });

  return { items, total };
}

// ─── Category access gate (replaces the old Service/Product master-row model) ────────────────
// The actual `assertVendorHasCategoryAccess` gate lives in category.service.ts (imported below)
// — it needs no vendor.service.ts state, and living there lets product.service.ts import it too
// without a vendor.service.ts <-> product.service.ts circular dependency.

/** Duration is a bookable time slot — required for a service deal, never required for a product deal. */
function assertDurationRequiredForService(productId: string | null | undefined, durationMinutes: number | null | undefined) {
  if (!productId && !durationMinutes) {
    throw new ApiError('VALIDATION_ERROR', 'durationMinutes is required for a service deal');
  }
}

/**
 * Replace-the-full-set pattern (same shape as role.service.ts#setRolePermissions) — a vendor's
 * enabled business modules + the top-level categories it's granted for them, saved together in
 * one call from the onboarding wizard's Step 2. Each `categoryId` must be a top-level category
 * (`parentId === null`) whose `type` matches one of the *enabled* modules — you can't grant a
 * Product category while `offersProduct` is false.
 */
export async function setVendorModulesAndCategoryAccess(
  vendorId: string,
  input: { offersService: boolean; offersProduct: boolean; offersTherapy: boolean; categoryIds: string[] },
) {
  await getVendorOrThrow(vendorId);

  const enabledTypes = new Set<CategoryType>([
    ...(input.offersService ? (['SERVICE'] as const) : []),
    ...(input.offersProduct ? (['PRODUCT'] as const) : []),
    ...(input.offersTherapy ? (['THERAPY'] as const) : []),
  ]);

  if (input.categoryIds.length > 0) {
    const categories = await prisma.category.findMany({ where: { id: { in: input.categoryIds } } });
    if (categories.length !== input.categoryIds.length) {
      throw new ApiError('VALIDATION_ERROR', 'One or more categoryIds do not exist');
    }
    for (const category of categories) {
      if (category.parentId !== null) {
        throw new ApiError('VALIDATION_ERROR', `Category "${category.name}" is a subcategory — grant its top-level category instead`);
      }
      if (!category.type || !enabledTypes.has(category.type)) {
        throw new ApiError('VALIDATION_ERROR', `Category "${category.name}" does not belong to an enabled business module`);
      }
    }
  }

  await prisma.$transaction([
    prisma.vendor.update({
      where: { id: vendorId },
      data: { offersService: input.offersService, offersProduct: input.offersProduct, offersTherapy: input.offersTherapy },
    }),
    prisma.vendorCategoryAccess.deleteMany({ where: { vendorId } }),
    ...(input.categoryIds.length > 0
      ? [
          prisma.vendorCategoryAccess.createMany({
            data: input.categoryIds.map((categoryId) => ({ vendorId, categoryId })),
          }),
        ]
      : []),
  ]);

  return prisma.vendorCategoryAccess.findMany({ where: { vendorId }, include: { category: true } });
}

export async function getVendorCategoryAccess(vendorId: string) {
  await getVendorOrThrow(vendorId);
  return prisma.vendorCategoryAccess.findMany({ where: { vendorId }, include: { category: true } });
}

// ─── Deal (shared, scoped by vendorId + branchId) ────────────────────────────

export async function listDeals(vendorId: string, branchId: string) {
  await getBranchScopedOrThrow(vendorId, branchId);
  return prisma.deal.findMany({
    where: { branchId },
    orderBy: { createdAt: 'desc' },
    include: {
      category: true,
      subcategory: true,
      product: true,
      mediaImages: { orderBy: DEAL_IMAGE_ORDER_BY },
      mediaVideo: true,
    },
  });
}

/** 404 if the deal doesn't exist; 403 if it exists but its branch/vendor don't match the caller's scope. */
export async function getDealScopedOrThrow(vendorId: string, branchId: string, dealId: string) {
  await getBranchScopedOrThrow(vendorId, branchId);
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new ApiError('NOT_FOUND', 'Deal not found');
  if (deal.branchId !== branchId || deal.vendorId !== vendorId) {
    throw new ApiError('FORBIDDEN', 'This deal does not belong to your vendor');
  }
  return deal;
}

/** Declared outside OFFERING_INCLUDE's own `as const` (and explicitly typed, not inferred) so
 *  its `orderBy` stays the mutable array Prisma's generated types expect — nesting a plain
 *  array literal directly inside an `as const` object freezes it into a readonly tuple, which
 *  `DealPackageOrderByWithRelationInput[]` rejects (same pattern as catalog.service.ts's
 *  PUBLIC_THERAPIST_PACKAGE_ORDER_BY). */
const DEAL_PACKAGE_ORDER_BY: Prisma.DealPackageOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { durationMinutes: 'asc' },
];

/** Same "declared outside the `as const` object" reasoning as DEAL_PACKAGE_ORDER_BY. */
const DEAL_IMAGE_ORDER_BY: Prisma.DealImageOrderByWithRelationInput[] = [
  { isPrimary: 'desc' },
  { sortOrder: 'asc' },
];

const OFFERING_INCLUDE = {
  category: { select: { id: true, name: true } },
  subcategory: { select: { id: true, name: true } },
  product: { select: { id: true, name: true } },
  packages: { orderBy: DEAL_PACKAGE_ORDER_BY },
  mediaImages: { orderBy: DEAL_IMAGE_ORDER_BY },
  mediaVideo: true,
} as const;

/** The linked Product (when this is a product deal) must belong to the SAME vendor
 *  (`getProductScopedOrThrow` 404s/403s otherwise) and its category/subcategory must match the
 *  Deal's — one definition of "valid catalog linkage" so a Deal can never point at a vendor's
 *  Kettle product while filed under a different category. */
async function assertProductMatchesDealCategory(
  vendorId: string,
  categoryId: string,
  subcategoryId: string | undefined,
  productId: string,
) {
  const product = await getProductScopedOrThrow(vendorId, productId);
  if (product.categoryId !== categoryId || (product.subcategoryId ?? undefined) !== subcategoryId) {
    throw new ApiError('VALIDATION_ERROR', "Deal's categoryId/subcategoryId must match the linked product's category");
  }
}

type DealPackageInput = NonNullable<DealCreateInput['packages']>[number];

/** Cheapest active package's price/duration becomes the Deal's own salePrice/originalPrice/
 *  durationMinutes — the "from price"/default-duration display cache every existing
 *  minPrice/maxPrice/sort/badge query already reads (see DealPackage's own schema doc comment).
 *  A no-op when `packages` is empty (a product deal, or a service deal update that didn't touch
 *  packages). */
async function syncDealPriceFromPackages(tx: Prisma.TransactionClient, dealId: string) {
  const cheapest = await tx.dealPackage.findFirst({
    where: { dealId, isActive: true },
    orderBy: { sellingPrice: 'asc' },
  });
  if (!cheapest) return;
  await tx.deal.update({
    where: { id: dealId },
    data: {
      salePrice: cheapest.sellingPrice,
      originalPrice: cheapest.originalPrice ?? cheapest.sellingPrice,
      durationMinutes: cheapest.durationMinutes,
    },
  });
}

export async function createDeal(
  vendorId: string,
  branchId: string,
  input: DealCreateInput,
  actorIsAdmin: boolean,
) {
  await getBranchScopedOrThrow(vendorId, branchId);
  await assertCategoryChildOf(input.categoryId, input.subcategoryId);
  if (input.productId) {
    await assertVendorHasCategoryAccess(vendorId, input.categoryId, 'PRODUCT');
    await assertProductMatchesDealCategory(vendorId, input.categoryId, input.subcategoryId, input.productId);
  } else {
    await assertVendorHasCategoryAccess(vendorId, input.categoryId, 'SERVICE');
  }
  assertDurationRequiredForService(input.productId, input.durationMinutes);
  // App-layer pre-check for a clean 409 in the common case — Deal.slug's DB-level @unique is
  // the hard guarantee this can't fully replace under a genuine race (two near-simultaneous
  // double-submits of the same form both reading "slug free" before either commits — see the
  // P2002 catch below, same discipline as order.service.ts#createOrderFromCart).
  const existingSlug = await prisma.deal.findUnique({ where: { slug: input.slug } });
  if (existingSlug) throw new ApiError('CONFLICT', `Deal slug "${input.slug}" already exists`);

  const { packages, ...dealFields } = input;

  try {
    return await prisma.$transaction(async (tx) => {
      const deal = await tx.deal.create({
        data: {
          ...dealFields,
          vendorId, // always derived server-side — never trusted from the client
          branchId,
          status: actorIsAdmin ? 'ACTIVE' : 'DRAFT',
          approvalStatus: actorIsAdmin ? 'APPROVED' : 'PENDING',
        } as unknown as Prisma.DealUncheckedCreateInput,
      });

      if (packages && packages.length > 0) {
        await tx.dealPackage.createMany({
          data: packages.map((p: DealPackageInput) => ({
            dealId: deal.id,
            durationMinutes: p.durationMinutes,
            sellingPrice: p.sellingPrice,
            originalPrice: p.originalPrice,
            isActive: p.isActive ?? true,
            sortOrder: p.sortOrder ?? 0,
          })),
        });
        await syncDealPriceFromPackages(tx, deal.id);
      }

      // A vendor-created (never admin-created) deal needs Superadmin review before it goes live
      // — see the `approvalStatus` gate above. Runs inside this same transaction so a rolled-back
      // deal creation (e.g. the P2002 slug race below) can never leave a stray notification behind.
      if (!actorIsAdmin) {
        const vendor = await tx.vendor.findUnique({ where: { id: vendorId }, select: { businessName: true } });
        await notificationService.notifySuperAdmins(tx, {
          type: 'DEAL_PENDING_APPROVAL',
          title: 'New Deal Pending Approval',
          message: `${vendor?.businessName ?? 'A vendor'} submitted "${deal.title}" for approval.`,
          entityType: 'DEAL',
          entityId: deal.id,
          metadata: { vendorId, branchId },
        });
      }

      return tx.deal.findUniqueOrThrow({ where: { id: deal.id }, include: OFFERING_INCLUDE });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ApiError('CONFLICT', `Deal slug "${input.slug}" already exists`);
    }
    throw err;
  }
}

export async function updateDeal(vendorId: string, branchId: string, dealId: string, input: DealUpdateInput) {
  const deal = await getDealScopedOrThrow(vendorId, branchId, dealId);
  if (input.categoryId || input.subcategoryId) {
    await assertCategoryChildOf(input.categoryId ?? deal.categoryId, input.subcategoryId ?? deal.subcategoryId ?? undefined);
  }
  // Any touch that could change the effective productId/category must keep the category-access
  // + "product's own category matches the deal's" invariants intact.
  const touchesOffering = 'productId' in input || 'durationMinutes' in input || 'categoryId' in input || 'subcategoryId' in input;
  if (touchesOffering) {
    const effectiveProductId = 'productId' in input ? input.productId : deal.productId ?? undefined;
    const effectiveCategoryId = input.categoryId ?? deal.categoryId;
    const effectiveSubcategoryId = input.subcategoryId ?? deal.subcategoryId ?? undefined;
    if (effectiveProductId) {
      await assertVendorHasCategoryAccess(vendorId, effectiveCategoryId, 'PRODUCT');
      await assertProductMatchesDealCategory(vendorId, effectiveCategoryId, effectiveSubcategoryId, effectiveProductId);
    } else {
      await assertVendorHasCategoryAccess(vendorId, effectiveCategoryId, 'SERVICE');
    }
    const effectiveDuration = 'durationMinutes' in input ? input.durationMinutes : deal.durationMinutes ?? undefined;
    assertDurationRequiredForService(effectiveProductId, effectiveDuration);
  }

  const { packages, ...dealFields } = input;

  return prisma.$transaction(async (tx) => {
    await tx.deal.update({ where: { id: dealId }, data: dealFields as unknown as Prisma.DealUncheckedUpdateInput });

    if (packages) {
      // Replace the full set, diffed by `id` — entries with an id update that row, entries
      // without one are created, any existing row whose id is no longer present is deleted
      // (safe: DealPackage's CartItem/OrderItem relations are `onDelete: SetNull`, see
      // DealPackage's own schema doc comment).
      const existing = await tx.dealPackage.findMany({ where: { dealId }, select: { id: true } });
      const keptIds = new Set(packages.filter((p: DealPackageInput) => p.id).map((p: DealPackageInput) => p.id));
      const toDelete = existing.filter((p) => !keptIds.has(p.id)).map((p) => p.id);
      if (toDelete.length > 0) {
        await tx.dealPackage.deleteMany({ where: { id: { in: toDelete } } });
      }
      for (const p of packages as DealPackageInput[]) {
        if (p.id) {
          await tx.dealPackage.update({
            where: { id: p.id },
            data: {
              durationMinutes: p.durationMinutes,
              sellingPrice: p.sellingPrice,
              originalPrice: p.originalPrice,
              ...(p.isActive !== undefined ? { isActive: p.isActive } : {}),
              ...(p.sortOrder !== undefined ? { sortOrder: p.sortOrder } : {}),
            },
          });
        } else {
          await tx.dealPackage.create({
            data: {
              dealId,
              durationMinutes: p.durationMinutes,
              sellingPrice: p.sellingPrice,
              originalPrice: p.originalPrice,
              isActive: p.isActive ?? true,
              sortOrder: p.sortOrder ?? 0,
            },
          });
        }
      }
      await syncDealPriceFromPackages(tx, dealId);
    }

    return tx.deal.findUniqueOrThrow({ where: { id: dealId }, include: OFFERING_INCLUDE });
  });
}

export async function setDealStatus(
  vendorId: string,
  branchId: string,
  dealId: string,
  status: DealStatus,
  actorIsAdmin: boolean,
) {
  const deal = await getDealScopedOrThrow(vendorId, branchId, dealId);
  if (!actorIsAdmin && status === 'ACTIVE' && deal.approvalStatus !== 'APPROVED') {
    throw new ApiError('FORBIDDEN', 'This deal must be approved before it can be activated');
  }
  return prisma.deal.update({ where: { id: dealId }, data: { status } });
}

/** Admin-only (routed only from the admin surface) — approve jumps straight to ACTIVE, same philosophy as vendor approval. */
export async function approveDeal(vendorId: string, branchId: string, dealId: string) {
  await getDealScopedOrThrow(vendorId, branchId, dealId);
  return prisma.deal.update({
    where: { id: dealId },
    data: { approvalStatus: 'APPROVED', status: 'ACTIVE', approvalRejectionReason: null },
  });
}

export async function rejectDeal(vendorId: string, branchId: string, dealId: string, reason: string) {
  await getDealScopedOrThrow(vendorId, branchId, dealId);
  return prisma.deal.update({
    where: { id: dealId },
    data: { approvalStatus: 'REJECTED' as DealApprovalStatus, status: 'INACTIVE', approvalRejectionReason: reason },
  });
}

/** Superadmin-only hard delete. `CartItem`/`OrderItem`'s `deal` relation has no `onDelete`
 *  (Postgres default = restrict), so a Deal with any real order/cart history can never be
 *  hard-deleted — Postgres blocks it with a clean P2003, translated here to a specific CONFLICT
 *  (use `setDealStatus`'s INACTIVE instead for a deal that has already sold). */
export async function deleteDeal(vendorId: string, branchId: string, dealId: string) {
  await getDealScopedOrThrow(vendorId, branchId, dealId);
  try {
    await prisma.deal.delete({ where: { id: dealId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw new ApiError('CONFLICT', 'Cannot delete this deal because it has existing orders or carts referencing it. Deactivate it instead.');
    }
    throw err;
  }
}

// ─── Deal media (shared upload system — see media.service.ts's doc comment for the full
// architecture; ownership stays here, mechanics live there, same layering as every other
// nested Deal resource in this file) ──────────────────────────────────────────

export async function addDealImage(vendorId: string, branchId: string, dealId: string, file: MediaFile) {
  await getDealScopedOrThrow(vendorId, branchId, dealId);
  return mediaService.addImage('deal', dealId, file);
}

export async function deleteDealImage(vendorId: string, branchId: string, dealId: string, imageId: string) {
  await getDealScopedOrThrow(vendorId, branchId, dealId);
  return mediaService.deleteImage('deal', dealId, imageId);
}

export async function reorderDealImages(vendorId: string, branchId: string, dealId: string, orderedImageIds: string[]) {
  await getDealScopedOrThrow(vendorId, branchId, dealId);
  return mediaService.reorderImages('deal', dealId, orderedImageIds);
}

export async function setDealPrimaryImage(vendorId: string, branchId: string, dealId: string, imageId: string) {
  await getDealScopedOrThrow(vendorId, branchId, dealId);
  return mediaService.setPrimaryImage('deal', dealId, imageId);
}

export async function replaceDealVideo(vendorId: string, branchId: string, dealId: string, file: MediaFile) {
  await getDealScopedOrThrow(vendorId, branchId, dealId);
  return mediaService.replaceVideo('deal', dealId, file);
}

export async function deleteDealVideo(vendorId: string, branchId: string, dealId: string) {
  await getDealScopedOrThrow(vendorId, branchId, dealId);
  return mediaService.deleteVideo('deal', dealId);
}

// ─── Vendor media (shared upload system — see media.service.ts's doc comment; ownership here
// is just "does this Vendor exist" — the self-service route already resolves its own vendorId
// via getMyVendorOrThrow before calling these, and the admin route can manage any vendor) ────

export async function addVendorImage(vendorId: string, file: MediaFile) {
  await getVendorOrThrow(vendorId);
  return mediaService.addImage('vendor', vendorId, file);
}

export async function deleteVendorImage(vendorId: string, imageId: string) {
  await getVendorOrThrow(vendorId);
  return mediaService.deleteImage('vendor', vendorId, imageId);
}

export async function reorderVendorImages(vendorId: string, orderedImageIds: string[]) {
  await getVendorOrThrow(vendorId);
  return mediaService.reorderImages('vendor', vendorId, orderedImageIds);
}

export async function setVendorPrimaryImage(vendorId: string, imageId: string) {
  await getVendorOrThrow(vendorId);
  return mediaService.setPrimaryImage('vendor', vendorId, imageId);
}

export async function replaceVendorVideo(vendorId: string, file: MediaFile) {
  await getVendorOrThrow(vendorId);
  return mediaService.replaceVideo('vendor', vendorId, file);
}

export async function deleteVendorVideo(vendorId: string) {
  await getVendorOrThrow(vendorId);
  return mediaService.deleteVideo('vendor', vendorId);
}

// ─── Categories (read-only lookup for the Deal form) ─────────────────────────

/** Thin re-export — `category.service.ts` now owns all Category data logic (admin CRUD +
 *  this lookup); kept here too since `vendors.routes.ts`'s `GET /vendors/categories` is the
 *  Deal form's existing, unchanged entry point. */
export const listCategories = listActiveCategories;
