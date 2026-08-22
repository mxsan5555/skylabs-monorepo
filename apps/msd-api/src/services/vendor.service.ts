import { randomUUID } from 'crypto';
import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { ensureUniqueSlug } from '../lib/slug';
import { assignRole, serializeUser } from './user.service';
import { listActiveCategories, assertCategoryChildOf } from './category.service';
import { getServiceOrThrow } from './service.service';
import { getProductOrThrow } from './product.service';
import * as mediaService from './media.service';
import type { MediaFile } from './media.service';
import { Prisma, type VendorStatus, type KycStatus, type DealStatus, type DealApprovalStatus } from '../generated/prisma-client';
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
const VENDOR_MEDIA_INCLUDE = { mediaImages: { orderBy: VENDOR_IMAGE_ORDER_BY }, mediaVideo: true } as const;

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
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'gstNumber', label: 'GST number' },
  { key: 'panNumber', label: 'PAN number' },
];

export async function submitForVerification(ownerUserId: string) {
  const vendor = await getMyVendorOrThrow(ownerUserId);
  if (vendor.status !== 'PROFILE_INCOMPLETE' && vendor.status !== 'REJECTED') {
    throw new ApiError('CONFLICT', `Cannot submit a vendor with status ${vendor.status}`);
  }
  const missing = REQUIRED_FOR_SUBMISSION.filter((f) => !vendor[f.key]).map((f) => f.label);
  if (missing.length > 0) {
    throw new ApiError('VALIDATION_ERROR', 'Profile is incomplete', { missing });
  }
  return prisma.vendor.update({ where: { id: vendor.id }, data: { status: 'PENDING_VERIFICATION', statusReason: null } });
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
  { key: 'owner', label: 'Owner Details', check: (v) => Boolean(v.ownerName && v.ownerMobile) },
  { key: 'address', label: 'Address', check: (v) => Boolean(v.address && v.city && v.state && v.pincode) },
  { key: 'kyc', label: 'Business / KYC', check: (v) => Boolean(v.gstNumber && v.panNumber) },
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
  return prisma.therapist.create({
    data: { ...input, vendorId, branchId } as Prisma.TherapistUncheckedCreateInput,
    include: THERAPIST_MEDIA_INCLUDE,
  });
}

export async function updateTherapist(vendorId: string, therapistId: string, input: TherapistUpdateInput) {
  await getTherapistScopedOrThrow(vendorId, therapistId);
  return prisma.therapist.update({
    where: { id: therapistId },
    data: input as Prisma.TherapistUncheckedUpdateInput,
    include: THERAPIST_MEDIA_INCLUDE,
  });
}

/** No delete — like Branch, a Therapist is only ever soft-disabled via isActive, never
 *  hard-deleted, to avoid orphaning historical Bookings that reference one. */
export async function setTherapistStatus(vendorId: string, therapistId: string, isActive: boolean) {
  await getTherapistScopedOrThrow(vendorId, therapistId);
  return prisma.therapist.update({ where: { id: therapistId }, data: { isActive } });
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
 *  is safe: Booking never references this row by id at read time, only a nullable traceability
 *  pointer, and its price/duration are already immutably snapshotted at booking time. */
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

// ─── Customers (derived from Order/Booking — no dedicated table) ─────────────

/**
 * Distinct customers who have at least one Order OR Booking with this vendor, for the
 * vendor-facing "Customers" screen. Deliberately NOT a new Prisma model/migration — grouped off
 * the existing Order/Booking rows and merged in application code, then the *distinct-customer*
 * list (not the raw Order/Booking rows) is paginated and hydrated with each User's display
 * fields. Same minimal, non-sensitive customer summary as ORDER_INCLUDE in order.service.ts
 * (id/name/phone/email only).
 *
 * Orders are grouped via OrderItem.vendorId, not Order.vendorId (the "primary vendor" only) —
 * a multi-vendor order where this vendor holds a non-primary line item must still surface that
 * customer here. `orderCount` counts distinct Orders touching this vendor, not raw item rows
 * (a multi-item order for this same vendor still counts once).
 */
export async function listMyCustomers(vendorId: string, opts: { page: number; pageSize: number }) {
  const [vendorOrderItems, bookingGroups] = await Promise.all([
    prisma.orderItem.findMany({
      where: { vendorId },
      select: { orderId: true, order: { select: { customerId: true, createdAt: true } } },
    }),
    prisma.booking.groupBy({
      by: ['customerId'],
      where: { vendorId },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
  ]);

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

  const merged = new Map<string, { orderCount: number; bookingCount: number; lastActivityAt: Date }>();
  for (const [customerId, g] of orderGroups) {
    merged.set(customerId, { orderCount: g.count, bookingCount: 0, lastActivityAt: g.maxCreatedAt });
  }
  for (const g of bookingGroups) {
    const existing = merged.get(g.customerId);
    if (existing) {
      existing.bookingCount = g._count._all;
      if (g._max.createdAt! > existing.lastActivityAt) existing.lastActivityAt = g._max.createdAt!;
    } else {
      merged.set(g.customerId, { orderCount: 0, bookingCount: g._count._all, lastActivityAt: g._max.createdAt! });
    }
  }

  const total = merged.size;
  const ranked = Array.from(merged.entries())
    .map(([customerId, stats]) => ({ customerId, ...stats }))
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
      bookingCount: p.bookingCount,
      lastActivityAt: p.lastActivityAt,
    };
  });

  return { items, total };
}

// ─── Deal offering validation (Service/Product linkage) ──────────────────────
//
// A Deal always represents exactly one catalog item: `serviceId` XOR `productId`, never both,
// never neither (nullable at the DB level only so Deal rows created before this column existed
// stay valid — see the Deal model's doc comment). These three checks are the enforcement of
// that rule; they're deliberately service-layer (not zod-level) because they need DB reads,
// matching how `assertCategoryChildOf` already works for Deal/Product/Service.

function assertExactlyOneOffering(serviceId: string | null | undefined, productId: string | null | undefined) {
  const hasService = Boolean(serviceId);
  const hasProduct = Boolean(productId);
  if (hasService === hasProduct) {
    throw new ApiError('VALIDATION_ERROR', 'A deal must reference exactly one of serviceId or productId');
  }
}

/** The linked Service/Product must actually exist (getServiceOrThrow/getProductOrThrow already
 *  404 otherwise) and its own category/subcategory must match the Deal's — one definition of
 *  "valid catalog linkage" so a Deal can never point at a Haircut Service while filed under the
 *  Skincare category. */
async function assertOfferingMatchesCatalogItem(
  categoryId: string,
  subcategoryId: string | undefined,
  serviceId: string | null | undefined,
  productId: string | null | undefined,
) {
  if (serviceId) {
    const service = await getServiceOrThrow(serviceId);
    if (service.categoryId !== categoryId || (service.subcategoryId ?? undefined) !== subcategoryId) {
      throw new ApiError('VALIDATION_ERROR', "Deal's categoryId/subcategoryId must match the linked service's category");
    }
  }
  if (productId) {
    const product = await getProductOrThrow(productId);
    if (product.categoryId !== categoryId || (product.subcategoryId ?? undefined) !== subcategoryId) {
      throw new ApiError('VALIDATION_ERROR', "Deal's categoryId/subcategoryId must match the linked product's category");
    }
  }
}

/** Duration is a bookable time slot — required for a service deal, never required for a product deal. */
function assertDurationRequiredForService(serviceId: string | null | undefined, durationMinutes: number | null | undefined) {
  if (serviceId && !durationMinutes) {
    throw new ApiError('VALIDATION_ERROR', 'durationMinutes is required for a service deal');
  }
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
      service: true,
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
  service: { select: { id: true, name: true } },
  product: { select: { id: true, name: true } },
  packages: { orderBy: DEAL_PACKAGE_ORDER_BY },
  mediaImages: { orderBy: DEAL_IMAGE_ORDER_BY },
  mediaVideo: true,
} as const;

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
  assertExactlyOneOffering(input.serviceId, input.productId);
  await assertCategoryChildOf(input.categoryId, input.subcategoryId);
  await assertOfferingMatchesCatalogItem(input.categoryId, input.subcategoryId, input.serviceId, input.productId);
  assertDurationRequiredForService(input.serviceId, input.durationMinutes);
  // App-layer pre-check for a clean 409 in the common case — Deal.slug's DB-level @unique is
  // the hard guarantee this can't fully replace under a genuine race (two near-simultaneous
  // double-submits of the same form both reading "slug free" before either commits — see the
  // P2002 catch below, same discipline as order.service.ts#createOrderFromBooking).
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
  // Deals created before this column existed have neither serviceId nor productId — they stay
  // fully editable (including their categoryId) without being forced to adopt one. Once a deal
  // is offering-linked (or an update is actively linking one), every touch that could change
  // the effective serviceId/productId/category must keep the "exactly one, matching category"
  // invariant.
  const touchesOffering = 'serviceId' in input || 'productId' in input || 'durationMinutes' in input;
  const dealHasOffering = Boolean(deal.serviceId || deal.productId);
  if (touchesOffering || (dealHasOffering && (input.categoryId || input.subcategoryId))) {
    const effectiveServiceId = 'serviceId' in input ? input.serviceId : deal.serviceId ?? undefined;
    const effectiveProductId = 'productId' in input ? input.productId : deal.productId ?? undefined;
    assertExactlyOneOffering(effectiveServiceId, effectiveProductId);
    const effectiveCategoryId = input.categoryId ?? deal.categoryId;
    const effectiveSubcategoryId = input.subcategoryId ?? deal.subcategoryId ?? undefined;
    await assertOfferingMatchesCatalogItem(effectiveCategoryId, effectiveSubcategoryId, effectiveServiceId, effectiveProductId);
    const effectiveDuration = 'durationMinutes' in input ? input.durationMinutes : deal.durationMinutes ?? undefined;
    assertDurationRequiredForService(effectiveServiceId, effectiveDuration);
  }

  const { packages, ...dealFields } = input;

  return prisma.$transaction(async (tx) => {
    await tx.deal.update({ where: { id: dealId }, data: dealFields as unknown as Prisma.DealUncheckedUpdateInput });

    if (packages) {
      // Replace the full set, diffed by `id` — entries with an id update that row, entries
      // without one are created, any existing row whose id is no longer present is deleted
      // (safe: DealPackage's Booking/OrderItem relations are `onDelete: SetNull`, see
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
