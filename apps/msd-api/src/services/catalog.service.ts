import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import type { Prisma } from '../generated/prisma-client';
import { listActiveCategories, getActiveCategoryBySlugOrThrow } from './category.service';

/** Shared by every entity's public select below — only what a card/gallery ever needs, ordered
 *  primary-first then by sortOrder (see DealImage's schema doc comment for the full media
 *  architecture). `mimeType`/`originalFilename` are omitted — the frontend never needs them for
 *  display, just `storageKey`/`isPrimary`. */
const PUBLIC_MEDIA_IMAGE_SELECT = { id: true, storageKey: true, isPrimary: true, sortOrder: true } as const;
const PUBLIC_MEDIA_IMAGE_ORDER_BY = [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }];
const PUBLIC_MEDIA_VIDEO_SELECT = { id: true, storageKey: true } as const;

/**
 * Public, unauthenticated customer catalogue — the read-only "discovery" surface described in
 * the marketplace architecture plan's Phase 6. Everything here is deliberately separate from
 * the admin-only `product.service.ts`/`service.service.ts`/`vendor.service.ts` reads: those use
 * bare Prisma `include` (safe only because every caller is already permission-gated staff), so
 * reusing them here would risk leaking KYC/bank/owner/audit fields to anonymous customers. Every
 * query below uses an explicit `select` allow-list instead — nothing is exposed by default.
 */

/** Only what a public storefront card/hero ever needs — never KYC, bank, owner, or audit fields.
 *  `slug` is included so a deal/product card's vendor-name link can point at `/vendor/:slug`. */
const PUBLIC_VENDOR_SELECT = {
  id: true,
  slug: true,
  businessName: true,
  city: true,
  logoUrl: true,
  mediaImages: { orderBy: PUBLIC_MEDIA_IMAGE_ORDER_BY, select: PUBLIC_MEDIA_IMAGE_SELECT },
  mediaVideo: { select: PUBLIC_MEDIA_VIDEO_SELECT },
} as const;
/** `latitude`/`longitude` are included so the Explore map view can plot a deal's real branch
 *  location when it's been set — nullable, since most seeded/onboarded branches don't have
 *  coordinates yet; the frontend must never fabricate a value when these come back null. */
const PUBLIC_BRANCH_SELECT = { id: true, name: true, city: true, address: true, latitude: true, longitude: true } as const;
const PUBLIC_CATEGORY_SELECT = { id: true, name: true, slug: true } as const;

/** Only active rows — an inactive package must never be selectable by a customer. A therapist's
 *  own duration/price menu, independent of any Deal (see TherapistPackage's schema doc comment)
 *  — matched against a selected Deal's own `durationMinutes` purely by that number at purchase
 *  time (booking.service.ts#resolveBookingPrice), never by any shared id. An empty array means
 *  this therapist has no priced packages yet; selecting them still works, just at the Deal's own
 *  (unoverridden) price. */
const PUBLIC_THERAPIST_PACKAGE_SELECT = {
  id: true,
  durationMinutes: true,
  sellingPrice: true,
  originalPrice: true,
} as const;

/** Declared outside PUBLIC_THERAPIST_SELECT's own `as const` (and explicitly typed, not
 *  inferred) so its `orderBy` stays the mutable array Prisma's generated types expect — nesting
 *  a plain array literal directly inside an `as const` object freezes it into a readonly tuple,
 *  which `TherapistPackageOrderByWithRelationInput[]` rejects (caught by the webpack/ts-loader
 *  production build, not by a plain `tsc --noEmit` run). */
const PUBLIC_THERAPIST_PACKAGE_ORDER_BY: Prisma.TherapistPackageOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { durationMinutes: 'asc' },
];

/** Only what the public vendor storefront's therapist list ever needs — Therapist has no
 *  auth/user link at all, but the select stays explicit and tight anyway, matching every other
 *  allow-list in this file. `therapistType`/`personName` are two distinct name concepts, never
 *  merged into one field — see Therapist's own schema doc comment. */
const PUBLIC_THERAPIST_SELECT = {
  id: true,
  therapistType: true,
  personName: true,
  gender: true,
  specialization: true,
  bio: true,
  experienceYears: true,
  photoUrl: true,
  packages: {
    where: { isActive: true },
    orderBy: PUBLIC_THERAPIST_PACKAGE_ORDER_BY,
    select: PUBLIC_THERAPIST_PACKAGE_SELECT,
  },
  mediaImages: { orderBy: PUBLIC_MEDIA_IMAGE_ORDER_BY, select: PUBLIC_MEDIA_IMAGE_SELECT },
  mediaVideo: { select: PUBLIC_MEDIA_VIDEO_SELECT },
} as const;

/** The flat, independently-browsable Therapist listing (`GET /catalog/therapists`) — unlike the
 *  nested-under-vendor-storefront `PUBLIC_THERAPIST_SELECT` above, this ALSO carries `vendor`/
 *  `branch` (a customer browsing Therapists directly, never having picked a Deal/vendor first,
 *  needs to know whose therapist this is) and `isActive`-filtered at the query's `where`, same
 *  as every other public listing in this file. */
const PUBLIC_THERAPIST_LISTING_SELECT = {
  ...PUBLIC_THERAPIST_SELECT,
  vendor: { select: PUBLIC_VENDOR_SELECT },
  branch: { select: PUBLIC_BRANCH_SELECT },
} as const;

/** Vendor storefront page (`GET /catalog/vendors/:slug`) — general location only (city/state/
 *  address), no lat/lng (no map on this surface yet), and nested active branches (each with its
 *  own active therapists). Never the KYC/bank/owner/audit fields — see this file's doc comment. */
const PUBLIC_VENDOR_DETAIL_SELECT = {
  id: true,
  slug: true,
  businessName: true,
  businessDescription: true,
  logoUrl: true,
  city: true,
  state: true,
  address: true,
  mediaImages: { orderBy: PUBLIC_MEDIA_IMAGE_ORDER_BY, select: PUBLIC_MEDIA_IMAGE_SELECT },
  mediaVideo: { select: PUBLIC_MEDIA_VIDEO_SELECT },
  branches: {
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      state: true,
      pincode: true,
      phone: true,
      openingHours: true,
      therapists: {
        where: { isActive: true },
        select: PUBLIC_THERAPIST_SELECT,
      },
    },
  },
} as const;
const PUBLIC_SERVICE_SELECT = { id: true, name: true, slug: true, description: true, image: true, imageAlt: true } as const;
const PUBLIC_PRODUCT_SELECT = {
  id: true,
  name: true,
  slug: true,
  brand: true,
  description: true,
  image: true,
  imageAlt: true,
  mediaImages: { orderBy: PUBLIC_MEDIA_IMAGE_ORDER_BY, select: PUBLIC_MEDIA_IMAGE_SELECT },
  mediaVideo: { select: PUBLIC_MEDIA_VIDEO_SELECT },
} as const;

/** Only active rows — an inactive package must never be selectable by a customer. Same shape as
 *  PUBLIC_THERAPIST_PACKAGE_SELECT above (see DealPackage's own schema doc comment for why this
 *  mirrors TherapistPackage exactly). Never used for a product deal — no duration/package
 *  concept applies there. */
const PUBLIC_DEAL_PACKAGE_SELECT = {
  id: true,
  durationMinutes: true,
  sellingPrice: true,
  originalPrice: true,
} as const;

/** Same "declared outside the `as const` object" reasoning as PUBLIC_THERAPIST_PACKAGE_ORDER_BY
 *  above — keeps `orderBy` a mutable array. */
const PUBLIC_DEAL_PACKAGE_ORDER_BY: Prisma.DealPackageOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { durationMinutes: 'asc' },
];

/// Deal and Therapist packages are independently managed and independently exposed — a Deal is
/// never nested under a Therapist here, nor a Therapist under a Deal; the frontend combines them
/// at purchase time (a customer may pick a Therapist for a Deal booking) by matching durations.
/// `salePrice`/`originalPrice`/`durationMinutes` on Deal itself are a synced "from price"/
/// default-duration display cache (see DealPackage's own schema doc comment) — accurate for
/// listing/sort/filter display, but NEVER the authoritative booking price for a service deal
/// that has packages; the customer's selected `packages[].id` is (booking.service.ts).
export const PUBLIC_DEAL_SELECT = {
  id: true,
  title: true,
  slug: true,
  shortDescription: true,
  description: true,
  originalPrice: true,
  salePrice: true,
  discountPercent: true,
  durationMinutes: true,
  images: true,
  category: { select: PUBLIC_CATEGORY_SELECT },
  subcategory: { select: PUBLIC_CATEGORY_SELECT },
  service: { select: PUBLIC_SERVICE_SELECT },
  product: { select: PUBLIC_PRODUCT_SELECT },
  vendor: { select: PUBLIC_VENDOR_SELECT },
  branch: { select: PUBLIC_BRANCH_SELECT },
  packages: {
    where: { isActive: true },
    orderBy: PUBLIC_DEAL_PACKAGE_ORDER_BY,
    select: PUBLIC_DEAL_PACKAGE_SELECT,
  },
  mediaImages: { orderBy: PUBLIC_MEDIA_IMAGE_ORDER_BY, select: PUBLIC_MEDIA_IMAGE_SELECT },
  mediaVideo: { select: PUBLIC_MEDIA_VIDEO_SELECT },
} as const;

/**
 * The one definition of "is this deal visible to a customer / still purchasable": active +
 * approved, its vendor active, its branch active, and — if it links a Service/Product — that
 * catalog item must also still be active. Reused by both the list and single-deal lookup below
 * (so a customer can never reach an otherwise-hidden deal just by guessing its id) and by
 * `order.service.ts`'s checkout revalidation (a Deal must still pass this same bar to be
 * order-able, not just a looser "does it exist" check).
 */
export const VISIBLE_DEAL_WHERE = {
  status: 'ACTIVE' as const,
  approvalStatus: 'APPROVED' as const,
  vendor: { status: 'ACTIVE' as const },
  branch: { isActive: true },
  AND: [
    { OR: [{ serviceId: null }, { service: { is: { isActive: true } } }] },
    { OR: [{ productId: null }, { product: { is: { isActive: true } } }] },
  ],
};

export async function getPublicCategoryTree() {
  const categories = await listActiveCategories();
  const topLevel = categories.filter((c) => !c.parentId);
  return topLevel.map((parent) => ({
    id: parent.id,
    name: parent.name,
    slug: parent.slug,
    description: parent.description,
    children: categories
      .filter((c) => c.parentId === parent.id)
      .map((child) => ({ id: child.id, name: child.name, slug: child.slug, description: child.description })),
  }));
}

export async function getPublicCategoryBySlug(slug: string) {
  const category = await getActiveCategoryBySlugOrThrow(slug);
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    children: category.children.map((child) => ({ id: child.id, name: child.name, slug: child.slug, description: child.description })),
  };
}

export async function listPublicDeals(opts: {
  page: number;
  pageSize: number;
  categoryId?: string;
  subcategoryId?: string;
  vendorId?: string;
  branchId?: string;
  type?: 'service' | 'product';
  search?: string;
  /** 'newest' (default) preserves the original unconditional `{createdAt: 'desc'}` ordering —
   *  every pre-existing caller that omits this gets byte-identical results. 'discount' is the
   *  only non-fabricated "best deals" proxy on Deal (no Review/Rating model exists). */
  sort?: 'newest' | 'discount';
  minPrice?: number;
  maxPrice?: number;
}) {
  const where = {
    ...VISIBLE_DEAL_WHERE,
    ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
    ...(opts.subcategoryId ? { subcategoryId: opts.subcategoryId } : {}),
    ...(opts.vendorId ? { vendorId: opts.vendorId } : {}),
    ...(opts.branchId ? { branchId: opts.branchId } : {}),
    ...(opts.type === 'service' ? { serviceId: { not: null } } : {}),
    ...(opts.type === 'product' ? { productId: { not: null } } : {}),
    ...(opts.minPrice !== undefined || opts.maxPrice !== undefined
      ? {
          salePrice: {
            ...(opts.minPrice !== undefined ? { gte: opts.minPrice } : {}),
            ...(opts.maxPrice !== undefined ? { lte: opts.maxPrice } : {}),
          },
        }
      : {}),
    ...(opts.search
      ? {
          OR: [
            { title: { contains: opts.search, mode: 'insensitive' as const } },
            { service: { is: { name: { contains: opts.search, mode: 'insensitive' as const } } } },
            { product: { is: { name: { contains: opts.search, mode: 'insensitive' as const } } } },
            { vendor: { is: { businessName: { contains: opts.search, mode: 'insensitive' as const } } } },
          ],
        }
      : {}),
  };
  // 'discount' sorts deals with the biggest discountPercent first; deals with no discount
  // (null) are pushed to the end via `nulls: 'last'` rather than sorting ahead of real
  // discounts (Prisma's null-sort-order support is GA on PostgreSQL — no preview flag needed).
  const orderBy =
    opts.sort === 'discount'
      ? [{ discountPercent: { sort: 'desc' as const, nulls: 'last' as const } }]
      : { createdAt: 'desc' as const };
  const [items, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      orderBy,
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: PUBLIC_DEAL_SELECT,
    }),
    prisma.deal.count({ where }),
  ]);
  return { items, total };
}

export async function getPublicDealOrThrow(id: string) {
  const deal = await prisma.deal.findFirst({ where: { id, ...VISIBLE_DEAL_WHERE }, select: PUBLIC_DEAL_SELECT });
  if (!deal) throw new ApiError('NOT_FOUND', 'Deal not found');
  return deal;
}

/**
 * Public vendor storefront (`GET /catalog/vendors/:slug`) — 404s for a missing OR non-ACTIVE
 * vendor (never leaks that a suspended/inactive/pending vendor exists, same "active gating"
 * convention as VISIBLE_DEAL_WHERE). Deals/Services/Products are deliberately NOT nested here —
 * the frontend reuses the now-extended `GET /catalog/deals?vendorId=&branchId=` for those,
 * per "reuse existing APIs first."
 */
export async function getPublicVendorBySlugOrThrow(slug: string) {
  const vendor = await prisma.vendor.findFirst({
    where: { slug, status: 'ACTIVE' },
    select: PUBLIC_VENDOR_DETAIL_SELECT,
  });
  if (!vendor) throw new ApiError('NOT_FOUND', 'Vendor not found');
  return vendor;
}

/**
 * Independently-browsable Therapist catalogue (`GET /catalog/therapists`) — mirrors
 * `listPublicDeals` exactly: a customer can browse/select a Therapist directly, never having
 * picked a Deal or even a vendor first (see Therapist's own schema doc comment). Only active
 * Therapists at an active Vendor/Branch, same "active gating" convention as VISIBLE_DEAL_WHERE.
 */
const VISIBLE_THERAPIST_WHERE = {
  isActive: true,
  vendor: { status: 'ACTIVE' as const },
  branch: { isActive: true },
};

export async function listPublicTherapists(opts: {
  page: number;
  pageSize: number;
  vendorId?: string;
  branchId?: string;
  search?: string;
}) {
  const where = {
    ...VISIBLE_THERAPIST_WHERE,
    ...(opts.vendorId ? { vendorId: opts.vendorId } : {}),
    ...(opts.branchId ? { branchId: opts.branchId } : {}),
    ...(opts.search
      ? {
          OR: [
            { therapistType: { contains: opts.search, mode: 'insensitive' as const } },
            { personName: { contains: opts.search, mode: 'insensitive' as const } },
            { vendor: { is: { businessName: { contains: opts.search, mode: 'insensitive' as const } } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.therapist.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: PUBLIC_THERAPIST_LISTING_SELECT,
    }),
    prisma.therapist.count({ where }),
  ]);
  return { items, total };
}

export async function getPublicTherapistOrThrow(id: string) {
  const therapist = await prisma.therapist.findFirst({
    where: { id, ...VISIBLE_THERAPIST_WHERE },
    select: PUBLIC_THERAPIST_LISTING_SELECT,
  });
  if (!therapist) throw new ApiError('NOT_FOUND', 'Therapist not found');
  return therapist;
}
