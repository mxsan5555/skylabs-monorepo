import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import type { Prisma } from '../generated/prisma-client';
import { listActiveCategories, getActiveCategoryBySlugOrThrow } from './category.service';
import { getActiveTagNamesFor } from './popular-tag.service';
import * as blogPostService from './blog-post.service';
import * as siteContentService from './site-content.service';

type TagRef = { id: string; name: string; slug: string };

/** Great-circle distance in kilometers between two lat/lng points — the one, reused distance
 *  calculation for every "near me" catalog query (never a per-query reimplementation). */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.asin(Math.sqrt(a));
}

/** Attaches `distanceKm` (real Haversine distance to the row's own `branch.latitude`/
 *  `longitude`, `null` when either the caller's coordinates or the branch's own coordinates are
 *  unavailable — never fabricated) to each row. When `latitude`/`longitude` are both supplied,
 *  also sorts nearest-first (nulls — no branch coordinates — sorted last); otherwise returns the
 *  rows in their original (already correctly ordered) order, matching every pre-existing caller
 *  that never passes coordinates. */
function withDistance<T extends { branch: { latitude: Prisma.Decimal | null; longitude: Prisma.Decimal | null } | null }>(
  rows: T[],
  latitude?: number,
  longitude?: number,
): (T & { distanceKm: number | null })[] {
  const withDist = rows.map((row) => {
    // `Number(decimal)` (not `.toNumber()`) — matches this codebase's existing Decimal-to-number
    // convention (e.g. `Number(deal.salePrice)`), and works uniformly whether `branch.latitude`
    // is a real Prisma Decimal instance or a plain string/number (as in this file's own tests).
    const branchLat = row.branch?.latitude != null ? Number(row.branch.latitude) : null;
    const branchLng = row.branch?.longitude != null ? Number(row.branch.longitude) : null;
    const distanceKm =
      latitude !== undefined && longitude !== undefined && branchLat !== null && branchLng !== null
        ? haversineKm(latitude, longitude, branchLat, branchLng)
        : null;
    return { ...row, distanceKm };
  });
  if (latitude === undefined || longitude === undefined) return withDist;
  return withDist.sort((a, b) => {
    if (a.distanceKm === null) return b.distanceKm === null ? 0 : 1;
    if (b.distanceKm === null) return -1;
    return a.distanceKm - b.distanceKm;
  });
}

/** Enriches Deal rows with `popularTags` (mapped via `PopularTagDeal`, keyed on the Deal's own
 *  id) and — separately, when a linked Product exists — the Product's OWN `popularTags` (mapped
 *  via `PopularTagProduct`, keyed on `Product.id`). A "Product" card on the storefront is
 *  technically still a Deal row (see Deal's schema doc comment), but Popular Tag mapping treats
 *  Deal and Product as the two distinct entities the request describes, matching the two
 *  separate join tables — inactive tags are already excluded by `getActiveTagNamesFor` itself,
 *  never left to the frontend to filter. */
async function withDealPopularTags<T extends { id: string; product: ({ id: string } & Record<string, unknown>) | null }>(
  deals: T[],
): Promise<(T & { popularTags: TagRef[] })[]> {
  const dealTags = await getActiveTagNamesFor('deal', deals.map((d) => d.id));
  const productIds = deals.map((d) => d.product?.id).filter((id): id is string => !!id);
  const productTags = productIds.length ? await getActiveTagNamesFor('product', productIds) : new Map<string, TagRef[]>();
  return deals.map((deal) => ({
    ...deal,
    popularTags: dealTags.get(deal.id) ?? [],
    product: deal.product ? { ...deal.product, popularTags: productTags.get(deal.product.id) ?? [] } : null,
  }));
}

async function withTherapistPopularTags<T extends { id: string }>(therapists: T[]): Promise<(T & { popularTags: TagRef[] })[]> {
  const tags = await getActiveTagNamesFor('therapist', therapists.map((t) => t.id));
  return therapists.map((t) => ({ ...t, popularTags: tags.get(t.id) ?? [] }));
}

async function withCategoryPopularTags<T extends { id: string }>(categories: T[]): Promise<(T & { popularTags: TagRef[] })[]> {
  const tags = await getActiveTagNamesFor('category', categories.map((c) => c.id));
  return categories.map((c) => ({ ...c, popularTags: tags.get(c.id) ?? [] }));
}

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
 *  own duration/price menu, entirely independent of any Deal (see TherapistPackage's schema doc
 *  comment) — a Therapist is always its own separate cart line, never coupled to a Deal's own
 *  packages. An empty array means this therapist has no priced packages yet and can't be added
 *  to a cart until one exists. */
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
/// never nested under a Therapist here, nor a Therapist under a Deal; they are always separate,
/// independently-added cart lines (see CartItem's own schema doc comment), never combined at
/// purchase time. `salePrice`/`originalPrice`/`durationMinutes` on Deal itself are a synced
/// "from price"/default-duration display cache (see DealPackage's own schema doc comment) —
/// accurate for listing/sort/filter display, but NEVER the authoritative cart/order price for a
/// service deal that has packages; the customer's selected `packages[].id` is (cart.service.ts).
export const PUBLIC_DEAL_SELECT = {
  id: true,
  title: true,
  slug: true,
  shortDescription: true,
  description: true,
  termsAndConditions: true,
  notes: true,
  policy: true,
  originalPrice: true,
  salePrice: true,
  discountPercent: true,
  durationMinutes: true,
  images: true,
  category: { select: PUBLIC_CATEGORY_SELECT },
  subcategory: { select: PUBLIC_CATEGORY_SELECT },
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
 * approved, its vendor active, its branch active, and — for a product deal — the linked Product
 * must also still be active (a service deal has no master catalog row to check — see Deal's own
 * schema doc comment). Reused by both the list and single-deal lookup below (so a customer can
 * never reach an otherwise-hidden deal just by guessing its id) and by `order.service.ts`'s
 * checkout revalidation (a Deal must still pass this same bar to be order-able, not just a
 * looser "does it exist" check).
 */
export const VISIBLE_DEAL_WHERE = {
  status: 'ACTIVE' as const,
  approvalStatus: 'APPROVED' as const,
  vendor: { status: 'ACTIVE' as const },
  branch: { isActive: true },
  // Wrapped in a single-element AND (rather than a bare top-level `OR`) so callers that add
  // their own `OR` clause (e.g. listPublicDeals's `search` filter) merge with this one instead
  // of silently overwriting it — a later spread of the same object key wins in JS.
  AND: [{ OR: [{ productId: null }, { product: { is: { isActive: true } } }] }],
};

/** Shared by both public tree builders below — a category row's own list of active children,
 *  filtered against the ALREADY-FETCHED flat list `all` (no extra query per level: every row in
 *  the tree — Category/Subcategory/Type — was fetched in one `listActiveCategories()`/
 *  `getActiveCategoryBySlugOrThrow()` call up front). Recurses one more level down so a
 *  Subcategory's own `children` is itself populated with its Type-tier rows — genuinely 3 levels
 *  deep (Category → Subcategory[] → Type[]), not the single `.filter()` hop this used to be
 *  (which silently dropped the Type tier from the public response entirely). */
function buildPublicChildren<T extends { id: string; parentId: string | null; name: string; slug: string; description: string | null }>(
  all: T[],
  parentId: string,
): Array<{ id: string; name: string; slug: string; description: string | null; children: Array<{ id: string; name: string; slug: string; description: string | null }> }> {
  return all
    .filter((c) => c.parentId === parentId)
    .map((child) => ({
      id: child.id,
      name: child.name,
      slug: child.slug,
      description: child.description,
      children: buildPublicChildren(all, child.id).map(({ id, name, slug, description }) => ({ id, name, slug, description })),
    }));
}

export async function getPublicCategoryTree() {
  const categories = await listActiveCategories();
  const topLevel = categories.filter((c) => !c.parentId);
  const withTags = await withCategoryPopularTags(topLevel);
  return withTags.map((parent) => ({
    id: parent.id,
    name: parent.name,
    slug: parent.slug,
    description: parent.description,
    // `type`/`isPopular` only ever live on a top-level row (see Category's schema doc comment)
    // — exposed here so the public storefront can drive the "Popular Category" homepage
    // carousels without a second admin-only fetch. Already ordered by sortOrder via
    // listActiveCategories, so no extra sort needed here.
    type: parent.type,
    isPopular: parent.isPopular,
    sortOrder: parent.sortOrder,
    popularTags: parent.popularTags,
    children: buildPublicChildren(categories, parent.id),
  }));
}

export async function getPublicCategoryBySlug(slug: string) {
  // getActiveCategoryBySlugOrThrow's own `include` already nests two levels deep (Subcategory[]
  // -> Type[] on each), so this is a direct map, not a second filter pass like
  // getPublicCategoryTree's flat-list case above.
  const category = await getActiveCategoryBySlugOrThrow(slug);
  const [withTags] = await withCategoryPopularTags([category]);
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    // `type`/`isPopular`/`sortOrder` only ever live on a top-level row (same as
    // getPublicCategoryTree above) — this is the field the storefront's category page reads to
    // automatically pick Deal vs Product vs Therapist listing, so it must round-trip here too.
    type: category.type,
    isPopular: category.isPopular,
    sortOrder: category.sortOrder,
    popularTags: withTags.popularTags,
    children: category.children.map((child) => ({
      id: child.id,
      name: child.name,
      slug: child.slug,
      description: child.description,
      children: child.children.map((leaf) => ({ id: leaf.id, name: leaf.name, slug: leaf.slug, description: leaf.description })),
    })),
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
  /** Narrow to deals whose branch is in this state/city — merged into the existing
   *  `branch: {isActive: true}` clause below, never overwriting it. Omitted → unchanged
   *  behavior (every existing caller that omits these gets byte-identical results). */
  state?: string;
  city?: string;
  /** 'newest' (default) preserves the original unconditional `{createdAt: 'desc'}` ordering —
   *  every pre-existing caller that omits this gets byte-identical results. 'discount' is the
   *  only non-fabricated "best deals" proxy on Deal (no Review/Rating model exists). */
  sort?: 'newest' | 'discount';
  minPrice?: number;
  maxPrice?: number;
  /** The customer's own browser-geolocation coordinates (see `useCurrentLocation`'s doc comment)
   *  — reuses the vendor's/branch's already-existing `latitude`/`longitude` columns for the
   *  distance calc, never persisted, never a new location model. Omitted → completely unchanged
   *  behavior (byte-identical to every pre-existing caller). */
  latitude?: number;
  longitude?: number;
}) {
  const where = {
    ...VISIBLE_DEAL_WHERE,
    ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
    ...(opts.subcategoryId ? { subcategoryId: opts.subcategoryId } : {}),
    ...(opts.vendorId ? { vendorId: opts.vendorId } : {}),
    ...(opts.branchId ? { branchId: opts.branchId } : {}),
    ...(opts.type === 'service' ? { productId: null } : {}),
    ...(opts.type === 'product' ? { productId: { not: null } } : {}),
    ...(opts.state || opts.city
      ? { branch: { is: { isActive: true, ...(opts.state ? { state: opts.state } : {}), ...(opts.city ? { city: opts.city } : {}) } } }
      : {}),
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
  // With coordinates, "nearest first" replaces whatever `sort` would otherwise apply — there is
  // no existing radius/city-state priority system to layer on top of (confirmed by research), so
  // per this app's own "keep it simple" fallback rule this is a plain full-set distance sort, not
  // a new business rule. Distance can't be computed/sorted in SQL without a raw query per row's
  // Decimal lat/lng, and the realistic result-set size here is small, so the full matching set is
  // fetched, sorted in memory, then paginated — never a per-page-only (and therefore wrong)
  // nearest-first ordering.
  if (opts.latitude !== undefined && opts.longitude !== undefined) {
    const [allRows, total] = await Promise.all([
      prisma.deal.findMany({ where, select: PUBLIC_DEAL_SELECT }),
      prisma.deal.count({ where }),
    ]);
    const sorted = withDistance(allRows, opts.latitude, opts.longitude);
    const page = sorted.slice((opts.page - 1) * opts.pageSize, (opts.page - 1) * opts.pageSize + opts.pageSize);
    const items = await withDealPopularTags(page);
    return { items, total };
  }

  const [rows, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      orderBy,
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: PUBLIC_DEAL_SELECT,
    }),
    prisma.deal.count({ where }),
  ]);
  const items = await withDealPopularTags(withDistance(rows));
  return { items, total };
}

/**
 * Distinct {state, city} pairs from active branches — drives the public location picker's
 * dropdown without a full branch fetch. Never includes an inactive branch's location (matches
 * every other public read's "active gating" convention in this file).
 */
export async function listPublicLocations() {
  const rows = await prisma.branch.findMany({
    where: { isActive: true, state: { not: null }, city: { not: null } },
    select: { state: true, city: true },
    distinct: ['state', 'city'],
    orderBy: [{ state: 'asc' }, { city: 'asc' }],
  });
  return rows as { state: string; city: string }[];
}

export async function getPublicDealOrThrow(id: string) {
  const deal = await prisma.deal.findFirst({ where: { id, ...VISIBLE_DEAL_WHERE }, select: PUBLIC_DEAL_SELECT });
  if (!deal) throw new ApiError('NOT_FOUND', 'Deal not found');
  const [withTags] = await withDealPopularTags([deal]);
  return withTags;
}

/**
 * Public vendor storefront (`GET /catalog/vendors/:slug`) — 404s for a missing OR non-ACTIVE
 * vendor (never leaks that a suspended/inactive/pending vendor exists, same "active gating"
 * convention as VISIBLE_DEAL_WHERE). Deals/Services/Products are deliberately NOT nested here —
 * the frontend reuses the now-extended `GET /catalog/deals?vendorId=&branchId=` for those,
 * per "reuse existing APIs first."
 */
export async function getPublicVendorBySlugOrThrow(slug: string, opts: { state?: string; city?: string } = {}) {
  const vendor = await prisma.vendor.findFirst({
    where: { slug, status: 'ACTIVE' },
    select: {
      ...PUBLIC_VENDOR_DETAIL_SELECT,
      branches: {
        ...PUBLIC_VENDOR_DETAIL_SELECT.branches,
        where: {
          isActive: true,
          ...(opts.state ? { state: opts.state } : {}),
          ...(opts.city ? { city: opts.city } : {}),
        },
      },
    },
  });
  if (!vendor) throw new ApiError('NOT_FOUND', 'Vendor not found');
  return vendor;
}

/**
 * Independently-browsable Therapist catalogue (`GET /catalog/therapists`) — mirrors
 * `listPublicDeals` exactly: a customer can browse/select a Therapist directly, never having
 * picked a Deal or even a vendor first (see Therapist's own schema doc comment). Only active
 * Therapists at an active Vendor/Branch, same "active gating" convention as VISIBLE_DEAL_WHERE.
 * Exported for `order.service.ts`'s checkout revalidation, same reuse convention as
 * VISIBLE_DEAL_WHERE.
 */
export const VISIBLE_THERAPIST_WHERE = {
  isActive: true,
  vendor: { status: 'ACTIVE' as const },
  branch: { isActive: true },
};

export async function listPublicTherapists(opts: {
  page: number;
  pageSize: number;
  categoryId?: string;
  subcategoryId?: string;
  vendorId?: string;
  branchId?: string;
  search?: string;
  /** See `listPublicDeals`'s identical param doc comment. */
  latitude?: number;
  longitude?: number;
}) {
  // Therapist has one FK (`specializationCategoryId`), not Deal's separate categoryId/
  // subcategoryId pair — per its schema doc comment it may point at a top-level THERAPY
  // Category, one of its Subcategories, or (in practice, per seed.ts) one of the Type-tier leaf
  // rows two levels below that — the taxonomy is 3 levels deep (Category -> Subcategory ->
  // Type). So "selected node" (whichever of categoryId/subcategoryId is more specific) must
  // match therapists tagged at that node OR anywhere in its subtree below it, not just direct
  // children — a single-level `parentId` lookup silently misses every Type-tier tag.
  const selectedNodeId = opts.subcategoryId ?? opts.categoryId;
  let specializationCategoryWhere: { specializationCategoryId: { in: string[] } } | undefined;
  if (selectedNodeId) {
    const children = await prisma.category.findMany({ where: { parentId: selectedNodeId }, select: { id: true } });
    const grandchildren = children.length
      ? await prisma.category.findMany({ where: { parentId: { in: children.map((c) => c.id) } }, select: { id: true } })
      : [];
    specializationCategoryWhere = {
      specializationCategoryId: { in: [selectedNodeId, ...children.map((c) => c.id), ...grandchildren.map((c) => c.id)] },
    };
  }
  const where = {
    ...VISIBLE_THERAPIST_WHERE,
    ...(specializationCategoryWhere ?? {}),
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
  // See `listPublicDeals`'s identical "keep it simple" doc comment on this same branch.
  if (opts.latitude !== undefined && opts.longitude !== undefined) {
    const [allRows, total] = await Promise.all([
      prisma.therapist.findMany({ where, select: PUBLIC_THERAPIST_LISTING_SELECT }),
      prisma.therapist.count({ where }),
    ]);
    const sorted = withDistance(allRows, opts.latitude, opts.longitude);
    const page = sorted.slice((opts.page - 1) * opts.pageSize, (opts.page - 1) * opts.pageSize + opts.pageSize);
    const items = await withTherapistPopularTags(page);
    return { items, total };
  }

  const [rows, total] = await Promise.all([
    prisma.therapist.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: PUBLIC_THERAPIST_LISTING_SELECT,
    }),
    prisma.therapist.count({ where }),
  ]);
  const items = await withTherapistPopularTags(withDistance(rows));
  return { items, total };
}

export async function getPublicTherapistOrThrow(id: string) {
  const therapist = await prisma.therapist.findFirst({
    where: { id, ...VISIBLE_THERAPIST_WHERE },
    select: PUBLIC_THERAPIST_LISTING_SELECT,
  });
  if (!therapist) throw new ApiError('NOT_FOUND', 'Therapist not found');
  const [withTags] = await withTherapistPopularTags([therapist]);
  return withTags;
}

// ─── CMS (Blog Posts / About Us / Contact Us) — thin pass-throughs to blog-post.service.ts/
// site-content.service.ts's own public functions, kept here (rather than importing those
// services directly in catalog.routes.ts) so every route in that file uniformly calls only
// `catalogService.*`, matching this file's own established pattern (e.g. getPublicCategoryTree
// wrapping category.service.ts). The real "never trust a caller-supplied status" enforcement
// lives in blog-post.service.ts/site-content.service.ts themselves, not here. ──────────────────

export async function listPublicBlogPosts(opts: { page: number; pageSize: number; search?: string; categorySlug?: string }) {
  return blogPostService.getPublishedBlogPosts(opts);
}

export async function getPublicBlogPostBySlug(slug: string) {
  return blogPostService.getPublishedBlogPostBySlugOrThrow(slug);
}

export async function getPublicAboutUs() {
  return siteContentService.getPublicAboutUs();
}

export async function getPublicContactUs() {
  return siteContentService.getPublicContactUs();
}
