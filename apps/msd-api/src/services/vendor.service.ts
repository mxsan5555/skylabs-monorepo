import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { assignRole, serializeUser } from './user.service';
import { listActiveCategories, assertCategoryChildOf } from './category.service';
import { getServiceOrThrow } from './service.service';
import { getProductOrThrow } from './product.service';
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
} from '../schemas/vendor.schema';

type VendorCreateInput = z.infer<typeof VendorCreateSchema>;
type VendorUpdateInput = z.infer<typeof VendorUpdateSchema>;
type VendorSelfCreateInput = z.infer<typeof VendorSelfCreateSchema>;
type VendorSelfUpdateInput = z.infer<typeof VendorSelfUpdateSchema>;
type BranchCreateInput = z.infer<typeof BranchCreateSchema>;
type BranchUpdateInput = z.infer<typeof BranchUpdateSchema>;
type DealCreateInput = z.infer<typeof DealCreateSchema>;
type DealUpdateInput = z.infer<typeof DealUpdateSchema>;

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

/** Standard `include` for any Vendor read/write that should carry its linked-owner summary + branch count. */
const OWNER_INCLUDE = { _count: { select: { branches: true } }, owner: OWNER_SUMMARY_SELECT } as const;

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
  const vendor = await prisma.vendor.create({
    data: {
      ...input,
      status: heuristicInitialStatus(input),
      createdByUserId,
    } as Prisma.VendorUncheckedCreateInput,
    include: OWNER_INCLUDE,
  });
  return serializeVendor(vendor);
}

export async function updateVendor(id: string, input: VendorUpdateInput) {
  await getVendorOrThrow(id);
  if ('ownerUserId' in input) await assertOwnerUserAvailable(input.ownerUserId, id);
  if (input.ownerUserId) await ensureVendorRoleAssigned(input.ownerUserId);
  const vendor = await prisma.vendor.update({
    where: { id },
    data: input as Prisma.VendorUncheckedUpdateInput,
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
  return prisma.vendor.findUnique({ where: { ownerUserId }, include: { _count: { select: { branches: true } } } });
}

export async function getMyVendorOrThrow(ownerUserId: string) {
  const vendor = await getVendorByOwnerUserId(ownerUserId);
  if (!vendor) throw new ApiError('NOT_FOUND', 'Complete your business profile first');
  return vendor;
}

export async function createSelfVendor(ownerUserId: string, input: VendorSelfCreateInput) {
  const existing = await prisma.vendor.findUnique({ where: { ownerUserId } });
  if (existing) throw new ApiError('CONFLICT', 'You already have a vendor profile');
  return prisma.vendor.create({
    data: {
      ...input,
      ownerUserId,
      status: heuristicInitialStatus(input),
    } as Prisma.VendorUncheckedCreateInput,
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
  return prisma.vendor.update({ where: { id: vendor.id }, data: data as Prisma.VendorUncheckedUpdateInput });
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
        category: { select: { id: true, name: true } },
        service: { select: { id: true, name: true } },
        product: { select: { id: true, name: true } },
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
    include: { category: true, subcategory: true, service: true, product: true },
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

const OFFERING_INCLUDE = {
  category: { select: { id: true, name: true } },
  subcategory: { select: { id: true, name: true } },
  service: { select: { id: true, name: true } },
  product: { select: { id: true, name: true } },
} as const;

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
  const existingSlug = await prisma.deal.findUnique({ where: { slug: input.slug } });
  if (existingSlug) throw new ApiError('CONFLICT', `Deal slug "${input.slug}" already exists`);

  return prisma.deal.create({
    data: {
      ...input,
      vendorId, // always derived server-side — never trusted from the client
      branchId,
      status: actorIsAdmin ? 'ACTIVE' : 'DRAFT',
      approvalStatus: actorIsAdmin ? 'APPROVED' : 'PENDING',
    } as unknown as Prisma.DealUncheckedCreateInput,
    include: OFFERING_INCLUDE,
  });
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
  return prisma.deal.update({ where: { id: dealId }, data: input as unknown as Prisma.DealUncheckedUpdateInput, include: OFFERING_INCLUDE });
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

// ─── Categories (read-only lookup for the Deal form) ─────────────────────────

/** Thin re-export — `category.service.ts` now owns all Category data logic (admin CRUD +
 *  this lookup); kept here too since `vendors.routes.ts`'s `GET /vendors/categories` is the
 *  Deal form's existing, unchanged entry point. */
export const listCategories = listActiveCategories;
