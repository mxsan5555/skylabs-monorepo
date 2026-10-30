import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import type { Prisma } from '../generated/prisma-client';
import { rankDeals, computeDealFacets, type DealSort, type FacetRow } from './deal-ranking';
import { daysFrom, hotIdsFrom, offerTag, tagsWhere, TAG_RULES, type OfferTagKey, type TagKind } from './offer-tag';
import { rankTherapists, type TherapistSort } from './therapist-ranking';
import { computeProductFacets } from './product-facets';
import { VISIBLE_DEAL_WHERE, VISIBLE_PRODUCT_WHERE, VISIBLE_THERAPIST_WHERE } from './catalog-visibility';
import { listActiveCategories, getActiveCategoryBySlugOrThrow } from './category.service';
import { getActiveTagNamesFor } from './popular-tag.service';
import { getPublicTreatmentDirectory } from './popular-treatment.service';
import { paidUnits, stockLeft } from './deal-limits';
import { discountOf } from './deal-pricing';
// Home Hero's public read is NOT wrapped here — home-hero.service.ts imports
// `VISIBLE_DEAL_WHERE`/`PUBLIC_DEAL_SELECT` FROM this file, so importing it back here would be a
// circular module dependency. `catalog.routes.ts` calls `homeHeroService.getPublicHomeHero`
// directly instead — the one deliberate exception to this file's usual "every /catalog/* route
// goes through catalogService" wrapper convention.
import * as blogPostService from './blog-post.service';
import * as siteContentService from './site-content.service';
import * as faqService from './faq.service';
import * as blogCategoryService from './blog-category.service';
import * as websitePageService from './website-page.service';
import * as howItWorksService from './how-it-works.service';
import * as careersService from './careers.service';
import * as socialMediaService from './social-media.service';

type TagRef = { id: string; name: string; slug: string };

const HOT_CACHE_MS = 10 * 60 * 1000;
const hotCache = new Map<TagKind, { at: number; ids: string[] }>();

/** Clears the cached hot lists (tests). */
export function clearHotCache() {
  hotCache.clear();
}

/** Hot ids for a kind (`offer-tag.ts` rule) from paid order lines in the window, cached 10 min. */
export async function getHotIds(kind: TagKind, now = new Date()): Promise<string[]> {
  const cached = hotCache.get(kind);
  if (cached && now.getTime() - cached.at < HOT_CACHE_MS) return cached.ids;
  const key = kind === 'deal' ? 'dealId' : 'productId';
  const groups = await prisma.orderItem.groupBy({
    by: [key],
    where: {
      [key]: { not: null },
      order: { status: { in: ['CONFIRMED', 'COMPLETED'] }, createdAt: { gte: daysFrom(now, -TAG_RULES.hotWindowDays) } },
    },
    _count: { _all: true },
  });
  const lines = ((groups ?? []) as unknown as Array<Record<string, unknown> & { _count: { _all: number } }>).map((g) => ({
    id: g[key] as string,
    count: g._count._all,
  }));
  const ids = [...hotIdsFrom(lines)];
  hotCache.set(kind, { at: now.getTime(), ids });
  return ids;
}

/** Adds each item's card `tag` (PLANNING §4 D30). */
function withOfferTags<T extends { id: string; createdAt: Date; endDate?: Date | null }>(
  rows: T[],
  discountOf: (row: T) => number | null | undefined,
  hot: string[],
  now: Date,
): (T & { tag: OfferTagKey | null })[] {
  const hotSet = new Set(hot);
  return rows.map((row) => ({ ...row, tag: offerTag({ id: row.id, createdAt: row.createdAt, endDate: row.endDate, discountPercent: discountOf(row) }, hotSet, now) }));
}

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
 *  id) — inactive tags are already excluded by `getActiveTagNamesFor` itself, never left to the
 *  frontend to filter. */
async function withDealPopularTags<T extends { id: string }>(deals: T[]): Promise<(T & { popularTags: TagRef[] })[]> {
  const dealTags = await getActiveTagNamesFor('deal', deals.map((d) => d.id));
  return deals.map((deal) => ({ ...deal, popularTags: dealTags.get(deal.id) ?? [] }));
}

/** Same as `withDealPopularTags`, for the independent Product catalog entity (mapped via
 *  `PopularTagProduct`, keyed on `Product.id` directly — no Deal pivot needed). */
async function withProductPopularTags<T extends { id: string }>(products: T[]): Promise<(T & { popularTags: TagRef[] })[]> {
  const productTags = await getActiveTagNamesFor('product', products.map((p) => p.id));
  return products.map((product) => ({ ...product, popularTags: productTags.get(product.id) ?? [] }));
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
  slug: true,
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
      latitude: true,
      longitude: true,
      therapists: {
        where: { isActive: true },
        select: PUBLIC_THERAPIST_SELECT,
      },
    },
  },
} as const;
/** Product is a fully independent, directly-purchasable catalog entity (see Product's own schema
 *  doc comment) — unlike PUBLIC_DEAL_SELECT this carries its own price fields directly, since
 *  there is no wrapping Deal to price it. No branch/location fields — Product has no branchId. */
export const PUBLIC_PRODUCT_SELECT = {
  id: true,
  name: true,
  slug: true,
  brand: true,
  description: true,
  summary: true,
  returnPolicy: true,
  image: true,
  imageAlt: true,
  price: true,
  originalPrice: true,
  discount: true,
  createdAt: true,
  category: { select: PUBLIC_CATEGORY_SELECT },
  subcategory: { select: PUBLIC_CATEGORY_SELECT },
  vendor: { select: PUBLIC_VENDOR_SELECT },
  mediaImages: { orderBy: PUBLIC_MEDIA_IMAGE_ORDER_BY, select: PUBLIC_MEDIA_IMAGE_SELECT },
  mediaVideo: { select: PUBLIC_MEDIA_VIDEO_SELECT },
} as const;

/** Only active rows — an inactive package must never be selectable by a customer. Same shape as
 *  PUBLIC_THERAPIST_PACKAGE_SELECT above (see DealPackage's own schema doc comment for why this
 *  mirrors TherapistPackage exactly). */
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
  // `notes` deliberately omitted — internal-admin-only (a checklist for staff, not customer
  // content); it must never reach a public response. `policy`/`termsAndConditions` stay public
  // (cancellation policy / T&C are genuinely customer-facing).
  policy: true,
  originalPrice: true,
  salePrice: true,
  discountPercent: true,
  durationMinutes: true,
  images: true,
  createdAt: true,
  endDate: true,
  category: { select: PUBLIC_CATEGORY_SELECT },
  subcategory: { select: PUBLIC_CATEGORY_SELECT },
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

const PUBLIC_DEAL_FAQ_ORDER_BY: { sortOrder: 'asc' }[] = [{ sortOrder: 'asc' }];

/** Deal page (`GET /catalog/deals/:idOrSlug`, PLANNING §2.7): the card fields plus everything the
 *  page shows, so the page needs no second call. Still an allow-list: no stock counts, owner,
 *  KYC or bank fields. */
const PUBLIC_DEAL_DETAIL_SELECT = {
  ...PUBLIC_DEAL_SELECT,
  highlights: true,
  eligibility: true,
  bookingRequired: true,
  bookingInstructions: true,
  validityDays: true,
  limitPerCustomer: true,
  maxBookings: true,
  cancellationPolicy: true,
  cancellationNote: true,
  startDate: true,
  updatedAt: true,
  vendor: { select: { ...PUBLIC_VENDOR_SELECT, businessDescription: true, website: true } },
  branch: {
    select: {
      ...PUBLIC_BRANCH_SELECT,
      addressLine2: true,
      state: true,
      pincode: true,
      phone: true,
      mapLocationUrl: true,
      openingHours: true,
    },
  },
  packages: {
    where: { isActive: true },
    orderBy: PUBLIC_DEAL_PACKAGE_ORDER_BY,
    select: { ...PUBLIC_DEAL_PACKAGE_SELECT, name: true, persons: true, inclusions: true },
  },
  mediaImages: { orderBy: PUBLIC_MEDIA_IMAGE_ORDER_BY, select: { ...PUBLIC_MEDIA_IMAGE_SELECT, altText: true } },
  faqs: { orderBy: PUBLIC_DEAL_FAQ_ORDER_BY, select: { id: true, question: true, answer: true } },
  therapistLinks: {
    where: { therapist: VISIBLE_THERAPIST_WHERE },
    select: { therapist: { select: PUBLIC_THERAPIST_LISTING_SELECT } },
  },
} as const;

/** Most rows a ranked search loads (short queries match a lot; ranking happens in memory). */
const SEARCH_RANK_LIMIT = 500;

/** "{n} bought" only from this many paid units (PLANNING §2.7). */
const BOUGHT_COUNT_MIN = 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


/** The visibility bars live in catalog-visibility.ts (no service imports, so no cycles). */
export { VISIBLE_DEAL_WHERE, VISIBLE_PRODUCT_WHERE, VISIBLE_THERAPIST_WHERE } from './catalog-visibility';

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

/** Public home page Treatment directory — thin pass-through to `popular-treatment.service.ts`'s
 *  own public function, which already selects only public-safe fields (id/name/slug + category
 *  slug) and filters to active groups/treatments server-side. */
export async function getPublicPopularTreatments() {
  return getPublicTreatmentDirectory();
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
    // `type` only ever lives on a top-level row (see Category's schema doc comment). The
    // "Popular Category"/"Popular Therapy" homepage carousels are driven entirely by
    // `popularTags` below (PopularTag/PopularTagCategory), not by a flag on Category itself.
    // Already ordered by sortOrder via listActiveCategories, so no extra sort needed here.
    type: parent.type,
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
    // `type`/`sortOrder` only ever live on a top-level row (same as getPublicCategoryTree
    // above) — `type` is the field the storefront's category page reads to automatically pick
    // Deal vs Product vs Therapist listing, so it must round-trip here too.
    type: category.type,
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

/** The base (non-facet) filters a public deal query can carry — category/subcategory/vendor(s)/
 *  branch(es)/search/state/city/price. Shared by `listPublicDeals` and `getPublicDealFacets`
 *  (the latter omits vendor(s)/branch(es)/price so those stay in-memory facet selections — see
 *  that function's own doc comment). */
export interface DealWhereOpts {
  categoryId?: string;
  subcategoryId?: string;
  vendorId?: string;
  branchId?: string;
  /** Comma-split vendor UUIDs → `vendorId: { in: [...] }`; wins over the single `vendorId` above
   *  when both are given (see `splitIds` in `catalog.schema.ts`). */
  vendorIds?: string[];
  /** Same as `vendorIds`, for `branchId`. */
  branchIds?: string[];
  search?: string;
  /** Narrow to deals whose branch is in this state/city — merged into the existing
   *  `branch: {isActive: true}` clause below, never overwriting it. Omitted → unchanged
   *  behavior (every existing caller that omits these gets byte-identical results). */
  state?: string;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
}

/** Builds `Deal.findMany`'s/`Deal.count`'s shared `where` — always visibility-gated (see
 *  `VISIBLE_DEAL_WHERE`), every other clause additive and omitted when its input is omitted
 *  (byte-identical to the pre-existing behavior for any caller that sends none of the new
 *  fields). Extracted out of `listPublicDeals` so `getPublicDealFacets` (Task 3) can reuse the
 *  exact same base-filter semantics without duplicating them. */
export function buildDealWhere(opts: DealWhereOpts) {
  return {
    ...VISIBLE_DEAL_WHERE,
    ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
    ...(opts.subcategoryId ? { subcategoryId: opts.subcategoryId } : {}),
    ...(opts.vendorIds?.length ? { vendorId: { in: opts.vendorIds } } : opts.vendorId ? { vendorId: opts.vendorId } : {}),
    ...(opts.branchIds?.length ? { branchId: { in: opts.branchIds } } : opts.branchId ? { branchId: opts.branchId } : {}),
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
            { vendor: { is: { businessName: { contains: opts.search, mode: 'insensitive' as const } } } },
            { category: { is: { name: { contains: opts.search, mode: 'insensitive' as const } } } },
            { subcategory: { is: { name: { contains: opts.search, mode: 'insensitive' as const } } } },
            { branch: { is: { city: { contains: opts.search, mode: 'insensitive' as const } } } },
          ],
        }
      : {}),
  };
}

/** Search rank (PLANNING §2.7): title starts with the query, title contains it, member name,
 *  then category, subcategory or city. Lower is better; stable for ties. */
export function searchRank(row: { title: string; vendor?: { businessName: string | null } | null }, query: string): number {
  const q = query.trim().toLowerCase();
  const title = row.title.toLowerCase();
  if (title.startsWith(q)) return 0;
  if (title.includes(q)) return 1;
  if ((row.vendor?.businessName ?? '').toLowerCase().includes(q)) return 2;
  return 3;
}

export async function listPublicDeals(
  opts: DealWhereOpts & {
    page: number;
    pageSize: number;
    /** 'relevance' (default): nearest first with coordinates, otherwise `createdAt desc` — every
     *  pre-existing caller that omits this (and coordinates) gets byte-identical results.
     *  'price_asc'/'price_desc': `salePrice` asc/desc, ties by `createdAt desc`. 'distance':
     *  nearest first (same as 'relevance' with coordinates). 'newest'/'discount': kept for
     *  existing callers (home, explore) — unchanged. See `deal-ranking.ts`'s own doc comment for
     *  how coordinates/radius interact with each sort. */
    sort?: DealSort;
    /** Radius in km around `latitude`/`longitude` — ignored without coordinates (see
     *  `rankDeals`'s own doc comment). */
    radiusKm?: number;
    /** The customer's own browser-geolocation coordinates (see `useCurrentLocation`'s doc
     *  comment) — reuses the vendor's/branch's already-existing `latitude`/`longitude` columns
     *  for the distance calc, never persisted, never a new location model. Omitted → completely
     *  unchanged behavior (byte-identical to every pre-existing caller). */
    latitude?: number;
    longitude?: number;
    /** Card tags (`tags=`): only deals whose shown tag is one of these. */
    tags?: OfferTagKey[];
  },
) {
  const now = new Date();
  const hot = await getHotIds('deal', now);
  const where = opts.tags?.length ? { ...buildDealWhere(opts), AND: [tagsWhere(opts.tags, 'deal', hot, now)] } : buildDealWhere(opts);
  const tagged = <T extends { id: string; createdAt: Date; endDate: Date | null; discountPercent: number | null }>(rows: T[]) =>
    withOfferTags(rows, (d) => d.discountPercent, hot, now);
  const sort: DealSort = opts.sort ?? 'relevance';
  // 'discount' sorts deals with the biggest discountPercent first; deals with no discount (null)
  // are pushed to the end via `nulls: 'last'` rather than sorting ahead of real discounts
  // (Prisma's null-sort-order support is GA on PostgreSQL — no preview flag needed). Every other
  // sort (including 'relevance'/'distance', whose nearest-first ordering — when coordinates are
  // given — is applied in memory by `rankDeals` below, not in SQL) falls back to `createdAt desc`.
  const orderBy =
    sort === 'price_asc'
      ? [{ salePrice: 'asc' as const }, { createdAt: 'desc' as const }, { id: 'asc' as const }]
      : sort === 'price_desc'
        ? [{ salePrice: 'desc' as const }, { createdAt: 'desc' as const }, { id: 'asc' as const }]
        : sort === 'discount'
          ? [{ discountPercent: { sort: 'desc' as const, nulls: 'last' as const } }]
          : { createdAt: 'desc' as const };
  // With coordinates, the full matching set is fetched (radius/relevance/distance ranking can't
  // be done correctly a page at a time), ranked in memory by `rankDeals`, then paginated —
  // `radiusKm` only ever applies alongside coordinates (see `rankDeals`'s own doc comment); a
  // `radiusKm` sent without coordinates is silently ignored and falls through to the plain SQL
  // path below, same as every other pre-existing caller that sends no coordinates.
  if (opts.latitude !== undefined && opts.longitude !== undefined) {
    const allRows = await prisma.deal.findMany({ where, orderBy, select: PUBLIC_DEAL_SELECT });
    const ranked = rankDeals(allRows, { sort, latitude: opts.latitude, longitude: opts.longitude, radiusKm: opts.radiusKm });
    const total = ranked.length;
    const page = ranked.slice((opts.page - 1) * opts.pageSize, (opts.page - 1) * opts.pageSize + opts.pageSize);
    const items = await withDealPopularTags(tagged(page));
    return { items, total };
  }

  if (opts.search?.trim() && sort === 'relevance') {
    const [allRows, matched] = await Promise.all([
      prisma.deal.findMany({ where, orderBy, take: SEARCH_RANK_LIMIT, select: PUBLIC_DEAL_SELECT }),
      prisma.deal.count({ where }),
    ]);
    const query = opts.search;
    const ranked = allRows
      .map((row, index) => ({ row, index, rank: searchRank(row, query) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map((r) => r.row);
    const page = ranked.slice((opts.page - 1) * opts.pageSize, opts.page * opts.pageSize);
    return { items: await withDealPopularTags(tagged(page)), total: Math.min(matched, SEARCH_RANK_LIMIT) };
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
  const items = await withDealPopularTags(tagged(rankDeals(rows, { sort })));
  return { items, total };
}

/** Only what the facet counters (`computeDealFacets`) need — never the full `PUBLIC_DEAL_SELECT`
 *  (facets don't render a card, just counts/labels). */
const FACET_DEAL_SELECT = {
  id: true,
  vendorId: true,
  branchId: true,
  salePrice: true,
  discountPercent: true,
  createdAt: true,
  endDate: true,
  vendor: { select: { businessName: true } },
  branch: { select: { name: true, city: true, latitude: true, longitude: true } },
} as const;

/**
 * Filter-panel facet counts for the public deal list (`GET /catalog/deals/facets`) — every base
 * filter (category/subcategory/search/state/city) goes to SQL via `buildDealWhere` exactly like
 * `listPublicDeals`, but vendor(s), branch(es), radius and price are deliberately left OUT of
 * that `where` and instead applied in memory by `computeDealFacets`, so each facet's own counts
 * can ignore its own selection (see that function's own doc comment) while still respecting every
 * other active filter. No paging/sort — this always counts the full base-filtered set.
 */
export async function getPublicDealFacets(
  opts: Omit<DealWhereOpts, 'vendorIds' | 'branchIds' | 'minPrice' | 'maxPrice' | 'vendorId' | 'branchId'> & {
    vendorIds?: string[];
    branchIds?: string[];
    radiusKm?: number;
    minPrice?: number;
    maxPrice?: number;
    latitude?: number;
    longitude?: number;
    tags?: OfferTagKey[];
  },
) {
  const { vendorIds = [], branchIds = [], radiusKm, minPrice, maxPrice, latitude, longitude, tags, ...base } = opts;
  const now = new Date();
  const [rows, hot] = await Promise.all([prisma.deal.findMany({ where: buildDealWhere(base), select: FACET_DEAL_SELECT }), getHotIds('deal', now)]);
  const facetRows = withOfferTags(rows, (d) => d.discountPercent, hot, now) as FacetRow[];
  return computeDealFacets(facetRows, { vendorIds, branchIds, radiusKm, minPrice, maxPrice, latitude, longitude, tags });
}

/** Distinct active {state, city} pairs plus the average of that city's branch coordinates, so
 *  the storefront can map browser coordinates to the nearest city without a geocoding API.
 *  `latitude`/`longitude` are null when no branch in the city has coordinates. */
export async function listPublicLocations() {
  const rows = await prisma.branch.groupBy({
    by: ['state', 'city'],
    // State and city are required columns (S22), so every active branch has both.
    where: { isActive: true, vendor: { status: 'ACTIVE' } },
    _avg: { latitude: true, longitude: true },
    orderBy: [{ state: 'asc' }, { city: 'asc' }],
  });
  const toNumber = (v: unknown) => (v == null ? null : Number(v));
  return rows.map((r) => ({
    state: r.state,
    city: r.city,
    latitude: toNumber(r._avg.latitude),
    longitude: toNumber(r._avg.longitude),
  }));
}

/**
 * The deal page (`GET /catalog/deals/:idOrSlug`, API.md §4): a UUID, the current slug or an old
 * slug; the response always carries the current `slug` so the page can replace its URL. Hidden
 * deals are a 404.
 */
export async function getPublicDealOrThrow(idOrSlug: string) {
  // `previousSlugs` is not present in the generated Prisma Deal model; resolve by UUID or current slug.
  const match = UUID_RE.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug };
  const deal = await prisma.deal.findFirst({ where: { ...match, ...VISIBLE_DEAL_WHERE }, select: PUBLIC_DEAL_DETAIL_SELECT });
  if (!deal) throw new ApiError('NOT_FOUND', 'Deal not found');

  const now = new Date();
  const [hot, sold] = await Promise.all([getHotIds('deal', now), paidUnits(deal.id)]);
  const [withTags] = await withDealPopularTags(withOfferTags([deal], (d) => d.discountPercent, hot, now));
  const { therapistLinks, maxBookings, shortDescription, packages, ...rest } = withTags;
  const left = stockLeft(maxBookings, sold);
  return {
    ...rest,
    shortDescription,
    tagline: shortDescription,
    currency: 'INR' as const,
    boughtCount: sold >= BOUGHT_COUNT_MIN ? sold : null,
    isSoldOut: left === 0,
    stockLeft: left,
    packages: packages.map((p) => ({ ...p, discountPercent: discountOf(p.sellingPrice, p.originalPrice) })),
    therapists: therapistLinks.map((link) => link.therapist),
  };
}

export interface ProductWhereOpts {
  categoryId?: string;
  /** Top-level category ids (`categoryIds=`); win over `categoryId`. */
  categoryIds?: string[];
  subcategoryId?: string;
  vendorId?: string;
  /** Business ids (`vendorIds=`, item 4); win over `vendorId`. */
  vendorIds?: string[];
  search?: string;
  minPrice?: number;
  maxPrice?: number;
}

/** `Product.findMany`/`count`'s shared `where`, always visibility-gated; shared by the list and
 *  `getPublicProductFacets` like `buildDealWhere`. */
export function buildProductWhere(opts: ProductWhereOpts) {
  return {
    ...VISIBLE_PRODUCT_WHERE,
    ...(opts.categoryIds?.length ? { categoryId: { in: opts.categoryIds } } : opts.categoryId ? { categoryId: opts.categoryId } : {}),
    ...(opts.subcategoryId ? { subcategoryId: opts.subcategoryId } : {}),
    ...(opts.vendorIds?.length ? { vendorId: { in: opts.vendorIds } } : opts.vendorId ? { vendorId: opts.vendorId } : {}),
    ...(opts.minPrice !== undefined || opts.maxPrice !== undefined
      ? {
          price: {
            ...(opts.minPrice !== undefined ? { gte: opts.minPrice } : {}),
            ...(opts.maxPrice !== undefined ? { lte: opts.maxPrice } : {}),
          },
        }
      : {}),
    ...(opts.search
      ? {
          OR: [
            { name: { contains: opts.search, mode: 'insensitive' as const } },
            { vendor: { is: { businessName: { contains: opts.search, mode: 'insensitive' as const } } } },
          ],
        }
      : {}),
  };
}

/**
 * Public, unauthenticated Product catalog — mirrors `listPublicDeals`, minus the
 * branch/location/duration concepts Product doesn't have (no branchId, no packages). Product is
 * a fully independent catalog entity (see Product's own schema doc comment) — never nested under
 * or filtered through a Deal.
 */
export async function listPublicProducts(
  opts: ProductWhereOpts & {
    page: number;
    pageSize: number;
    /** 'relevance' (default) and 'newest' both order by `createdAt desc`. 'price_asc'/'price_desc'
     *  order by `price`, ties by `createdAt desc`. 'discount' is the only non-fabricated "best
     *  deals" proxy on Product (no Review/Rating model exists). */
    sort?: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'discount';
    tags?: OfferTagKey[];
  },
) {
  const now = new Date();
  const hot = await getHotIds('product', now);
  const where = opts.tags?.length ? { ...buildProductWhere(opts), AND: [tagsWhere(opts.tags, 'product', hot, now)] } : buildProductWhere(opts);
  const orderBy =
    opts.sort === 'price_asc'
      ? [{ price: 'asc' as const }, { createdAt: 'desc' as const }, { id: 'asc' as const }]
      : opts.sort === 'price_desc'
        ? [{ price: 'desc' as const }, { createdAt: 'desc' as const }, { id: 'asc' as const }]
        : opts.sort === 'discount'
          ? [{ discount: { sort: 'desc' as const, nulls: 'last' as const } }]
          : { createdAt: 'desc' as const };
  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: PUBLIC_PRODUCT_SELECT,
    }),
    prisma.product.count({ where }),
  ]);
  const items = await withProductPopularTags(withOfferTags(rows, (p) => p.discount, hot, now));
  return { items, total };
}

/** Filter-panel counts for the public product list (`GET /catalog/products/facets`): base
 *  filters in SQL, category / business / tag / price in memory so each ignores its own selection. */
export async function getPublicProductFacets(opts: ProductWhereOpts & { tags?: OfferTagKey[] }) {
  const { categoryId, categoryIds, vendorIds, minPrice, maxPrice, tags = [], ...base } = opts;
  const now = new Date();
  const [rows, hot] = await Promise.all([
    prisma.product.findMany({
      where: buildProductWhere(base),
      select: {
        id: true,
        price: true,
        discount: true,
        createdAt: true,
        vendorId: true,
        category: { select: PUBLIC_CATEGORY_SELECT },
        vendor: { select: { businessName: true } },
      },
    }),
    getHotIds('product', now),
  ]);
  return computeProductFacets(withOfferTags(rows, (p) => p.discount, hot, now), {
    categoryIds: categoryIds ?? (categoryId ? [categoryId] : []),
    vendorIds,
    tags,
    minPrice,
    maxPrice,
  });
}

export async function getPublicProductOrThrow(id: string) {
  const product = await prisma.product.findFirst({ where: { id, ...VISIBLE_PRODUCT_WHERE }, select: PUBLIC_PRODUCT_SELECT });
  if (!product) throw new ApiError('NOT_FOUND', 'Product not found');
  const [withTags] = await withProductPopularTags([product]);
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
  const vendor = await prisma.member.findFirst({
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
 * Therapists at an active Vendor/Branch (VISIBLE_THERAPIST_WHERE).
 */
export interface TherapistWhereOpts {
  categoryId?: string;
  subcategoryId?: string;
  vendorId?: string;
  branchId?: string;
  vendorIds?: string[];
  branchIds?: string[];
  search?: string;
  state?: string;
  city?: string;
}

/** `Therapist.findMany`/`count`'s shared `where`, always visibility-gated. */
async function buildTherapistWhere(opts: TherapistWhereOpts) {
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
  return {
    ...VISIBLE_THERAPIST_WHERE,
    ...(specializationCategoryWhere ?? {}),
    ...(opts.vendorIds?.length ? { vendorId: { in: opts.vendorIds } } : opts.vendorId ? { vendorId: opts.vendorId } : {}),
    ...(opts.branchIds?.length ? { branchId: { in: opts.branchIds } } : opts.branchId ? { branchId: opts.branchId } : {}),
    // Merged into the visibility clause's `branch: { isActive: true }`, never replacing it.
    ...(opts.state || opts.city
      ? { branch: { isActive: true, ...(opts.state ? { state: opts.state } : {}), ...(opts.city ? { city: opts.city } : {}) } }
      : {}),
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
}

/**
 * Independently-browsable Therapist catalogue (`GET /catalog/therapists`) — a customer can
 * browse/select a Therapist directly, never having picked a Deal or even a vendor first (see
 * Therapist's own schema doc comment). Only active Therapists at an active Vendor/Branch
 * (VISIBLE_THERAPIST_WHERE). Coordinates, a price sort or a price/radius filter load the full
 * matching set and rank it in memory (`rankTherapists`) before paging, so page 2 continues
 * page 1's order; otherwise SQL pages newest first.
 */
export async function listPublicTherapists(
  opts: TherapistWhereOpts & {
    page: number;
    pageSize: number;
    sort?: TherapistSort;
    minPrice?: number;
    maxPrice?: number;
    radiusKm?: number;
    /** See `listPublicDeals`'s identical param doc comment. */
    latitude?: number;
    longitude?: number;
  },
) {
  const where = await buildTherapistWhere(opts);
  const sort = opts.sort ?? 'relevance';
  const hasCoords = opts.latitude !== undefined && opts.longitude !== undefined;
  if (hasCoords || sort === 'price_asc' || sort === 'price_desc' || opts.minPrice !== undefined || opts.maxPrice !== undefined) {
    const allRows = await prisma.therapist.findMany({ where, orderBy: { createdAt: 'desc' }, select: PUBLIC_THERAPIST_LISTING_SELECT });
    const ranked = rankTherapists(allRows, { sort, latitude: opts.latitude, longitude: opts.longitude, radiusKm: opts.radiusKm, minPrice: opts.minPrice, maxPrice: opts.maxPrice });
    const page = ranked.slice((opts.page - 1) * opts.pageSize, (opts.page - 1) * opts.pageSize + opts.pageSize);
    const items = await withTherapistPopularTags(page);
    return { items, total: ranked.length };
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

/** Filter-panel counts for the therapist list (`GET /catalog/therapists/facets`), in the deal
 *  facet shape: price = each therapist's lowest active package. */
export async function getPublicTherapistFacets(
  opts: Omit<TherapistWhereOpts, 'vendorIds' | 'branchIds' | 'vendorId' | 'branchId'> & {
    vendorIds?: string[];
    branchIds?: string[];
    radiusKm?: number;
    minPrice?: number;
    maxPrice?: number;
    latitude?: number;
    longitude?: number;
  },
) {
  const { vendorIds = [], branchIds = [], radiusKm, minPrice, maxPrice, latitude, longitude, ...base } = opts;
  const rows = await prisma.therapist.findMany({
    where: await buildTherapistWhere(base),
    select: {
      id: true,
      vendorId: true,
      branchId: true,
      packages: { where: { isActive: true }, select: { sellingPrice: true } },
      vendor: { select: { businessName: true } },
      branch: { select: { name: true, city: true, latitude: true, longitude: true } },
    },
  });
  const facetRows: FacetRow[] = rankTherapists(rows, { sort: 'relevance' }).map((r) => ({
    ...r,
    salePrice: r.fromPrice ?? Number.NaN,
    vendor: r.vendor ? { ...r.vendor, businessName: r.vendor.businessName ?? '' } : null,
  }));
  const { vendors, branches, distance, price } = computeDealFacets(facetRows, { vendorIds, branchIds, radiusKm, minPrice, maxPrice, latitude, longitude });
  return { vendors, branches, distance, price };
}

export async function getPublicTherapistOrThrow(id: string) {
  const therapist = await prisma.therapist.findFirst({
    where: { OR: [{ id }, { slug: id }], ...VISIBLE_THERAPIST_WHERE },
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

export async function listPublicFaqs() {
  return faqService.listPublicFaqs();
}

export async function listPublicBlogCategories() {
  return blogCategoryService.listPublicBlogCategories();
}

export async function getPublicWebsitePageBySlug(slug: string) {
  return websitePageService.getPublicWebsitePageBySlugOrThrow(slug);
}

export async function getPublicHowItWorks() {
  return howItWorksService.getPublicHowItWorks();
}

export async function getPublicCareers() {
  return careersService.getPublicCareers();
}

export async function listPublicSocialMediaLinks() {
  return socialMediaService.listPublicSocialMediaLinks();
}
