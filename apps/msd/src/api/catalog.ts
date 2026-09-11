import { apiGet } from './rbac/client';
import type { MediaImage, MediaVideo } from './media';
import type { BlogBlock } from '../types';

/**
 * Public, unauthenticated customer catalogue client — mirrors msd-api's `/catalog/*` routes.
 * Reuses `apiGet` from `api/rbac/client.ts` (not the unused `api-client.ts`) because msd-api's
 * envelope/error shape (`{ data, error, meta }`) is identical for every route, public or not;
 * `apiGet` already supports a null token for exactly this case. No auth token is ever sent.
 */

export interface CatalogCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

/** One active Popular Tag mapping (Superadmin-managed, e.g. "Trending") — inactive tags are
 *  already filtered out server-side, never left to the frontend to hide (see msd-api's
 *  `getActiveTagNamesFor`). */
export interface CatalogPopularTag {
  id: string;
  name: string;
  slug: string;
}

/** Only ever present on a top-level row (see msd-api's `Category.type` schema doc comment) —
 *  `undefined` for a subcategory entry (which never appears at the top of the tree anyway). */
export interface CatalogCategoryWithChildren extends CatalogCategory {
  type?: 'SERVICE' | 'PRODUCT' | 'THERAPY' | null;
  isPopular?: boolean;
  sortOrder?: number;
  popularTags?: CatalogPopularTag[];
  children: CatalogCategory[];
}

/** `GET /catalog/locations` — distinct `{state, city}` pairs from active branches, used to
 *  populate the public location picker without a full branch fetch. */
export interface CatalogLocation {
  state: string;
  city: string;
}

/** A service Deal's own duration/price menu entry — a real child row (DealPackage), never a
 *  sibling Deal row. Only active packages are ever included here. Empty for a not-yet-migrated
 *  legacy service deal with no packages configured yet. */
export interface CatalogDealPackage {
  id: string;
  durationMinutes: number;
  sellingPrice: string;
  originalPrice: string | null;
}

export interface CatalogDeal {
  id: string;
  title: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  termsAndConditions: string | null;
  notes: string | null;
  policy: string | null;
  /** A synced "from price"/default-duration display cache (kept in sync with the cheapest
   *  active `packages[]` entry server-side — see DealPackage's own schema doc comment in
   *  msd-api) — accurate for listing/sort/filter display, but NEVER the authoritative cart/order
   *  price for a service deal that has packages; the customer's selected `packages[].id` is. */
  originalPrice: string;
  salePrice: string;
  discountPercent: number | null;
  durationMinutes: number | null;
  images: string[] | null;
  category: CatalogCategory | null;
  subcategory: CatalogCategory | null;
  vendor: { id: string; slug: string | null; businessName: string | null; city: string | null; logoUrl: string | null } | null;
  /** `latitude`/`longitude` are Decimal → string over the wire (same convention as
   *  originalPrice/salePrice below), and nullable — most branches don't have coordinates set
   *  yet. Never fabricate a value when these are null; treat as "location not available". */
  branch: { id: string; name: string; city: string | null; address: string | null; latitude: string | null; longitude: string | null } | null;
  packages: CatalogDealPackage[];
  mediaImages?: MediaImage[];
  mediaVideo?: MediaVideo | null;
  popularTags?: CatalogPopularTag[];
  /** Real Haversine distance (km) to this deal's own branch coordinates, computed only when the
   *  caller passed `latitude`/`longitude` to `listCatalogDeals` — `null` whenever either side's
   *  coordinates are unavailable, never fabricated. Optional (not just nullable) since existing
   *  test fixtures typed as `CatalogDeal` predate this field. */
  distanceKm?: number | null;
}

/** `Branch.openingHours` shape — keys are lowercase 3-letter day codes (`mon`…`sun`); `open:
 *  false` means closed all day (start/end are then meaningless). Mirrors the vendor-facing edit
 *  form's own `DayHours`/`OpeningHours` types (`apps/msd/src/api/rbac/vendors.ts`) exactly — kept
 *  as an independent type here (not imported) since this is the public, unauthenticated catalog
 *  API surface, never the authenticated RBAC vendor client. Absent (`null`) for branches that
 *  haven't set hours yet, or missing a given day's key if only some days were configured. */
export interface CatalogDayHours {
  open: boolean;
  start?: string;
  end?: string;
}
export type CatalogOpeningHours = Partial<Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', CatalogDayHours>>;

/** A therapist's own duration/price menu entry — independent of any Deal (see msd-api's
 *  TherapistPackage schema doc comment). Combined with a Deal only at purchase time, by matching
 *  `durationMinutes` against the customer's selected Deal — never by any shared id. Only active
 *  packages are ever included here. */
export interface CatalogTherapistPackage {
  id: string;
  durationMinutes: number;
  sellingPrice: string;
  originalPrice: string | null;
}

export interface CatalogVendorTherapist {
  id: string;
  /** The service/role label a customer browses by (e.g. "Legs Therapist") — distinct from
   *  `personName` below, never merged into one field; the customer must see both clearly. */
  therapistType: string;
  /** The actual staff member (e.g. "Ramesh Kumar"). */
  personName: string;
  gender: string | null;
  specialization: string | null;
  bio: string | null;
  experienceYears: number | null;
  photoUrl: string | null;
  packages: CatalogTherapistPackage[];
  mediaImages?: MediaImage[];
  mediaVideo?: MediaVideo | null;
  popularTags?: CatalogPopularTag[];
}

/** The flat, independently-browsable Therapist listing entry (`GET /catalog/therapists`) —
 *  unlike `CatalogVendorTherapist` above (nested under a vendor storefront), this also carries
 *  `vendor`/`branch`, since a customer browsing Therapists directly never picks a Deal/vendor
 *  first (see msd-api's PUBLIC_THERAPIST_LISTING_SELECT doc comment). */
export interface CatalogTherapist extends CatalogVendorTherapist {
  vendor: { id: string; slug: string | null; businessName: string | null; city: string | null; logoUrl: string | null } | null;
  branch: { id: string; name: string; city: string | null; address: string | null; latitude: string | null; longitude: string | null } | null;
  /** See `CatalogDeal`'s identical field doc comment. */
  distanceKm?: number | null;
}

export interface CatalogVendorBranch {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  openingHours: CatalogOpeningHours | null;
  therapists: CatalogVendorTherapist[];
}

export interface CatalogVendorDetail {
  id: string;
  slug: string;
  businessName: string;
  businessDescription: string | null;
  logoUrl: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  branches: CatalogVendorBranch[];
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export function listCatalogCategories() {
  return apiGet<CatalogCategoryWithChildren[]>('/catalog/categories', null);
}

export function getCatalogCategory(slug: string) {
  return apiGet<CatalogCategoryWithChildren>(`/catalog/categories/${encodeURIComponent(slug)}`, null);
}

export function listCatalogDeals(opts: {
  page?: number;
  pageSize?: number;
  categoryId?: string;
  subcategoryId?: string;
  vendorId?: string;
  branchId?: string;
  search?: string;
  state?: string;
  city?: string;
  sort?: 'newest' | 'discount';
  minPrice?: number;
  maxPrice?: number;
  /** From `useCurrentLocation`'s raw `coords` — when both are present, results come back
   *  nearest-first with a real `distanceKm` per item; omitted → unchanged behavior. */
  latitude?: number;
  longitude?: number;
} = {}) {
  return apiGet<CatalogDeal[]>(`/catalog/deals${toQuery(opts)}`, null);
}

export function getCatalogDeal(id: string) {
  return apiGet<CatalogDeal>(`/catalog/deals/${id}`, null);
}

/** Product is a fully independent, directly-purchasable catalog entity (see msd-api's Product
 *  schema doc comment) — never nested under or fetched through a Deal. No branch/location
 *  fields (Product has no branchId) and no `packages` (no duration/tier concept applies). */
export interface CatalogProduct {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  description: string | null;
  summary: string | null;
  image: string | null;
  imageAlt: string | null;
  price: string;
  originalPrice: string | null;
  discount: number | null;
  category: CatalogCategory | null;
  subcategory: CatalogCategory | null;
  vendor: { id: string; slug: string | null; businessName: string | null; city: string | null; logoUrl: string | null } | null;
  mediaImages?: MediaImage[];
  mediaVideo?: MediaVideo | null;
  popularTags?: CatalogPopularTag[];
}

export function listCatalogProducts(opts: {
  page?: number;
  pageSize?: number;
  categoryId?: string;
  subcategoryId?: string;
  vendorId?: string;
  search?: string;
  sort?: 'newest' | 'discount';
  minPrice?: number;
  maxPrice?: number;
} = {}) {
  return apiGet<CatalogProduct[]>(`/catalog/products${toQuery(opts)}`, null);
}

export function getCatalogProduct(id: string) {
  return apiGet<CatalogProduct>(`/catalog/products/${id}`, null);
}

/** Distinct `{state, city}` pairs from active branches — drives the public State/City picker
 *  (Explore's location filter, etc.) without fetching every branch. */
export function listCatalogLocations() {
  return apiGet<CatalogLocation[]>('/catalog/locations', null);
}

export function getCatalogVendor(slug: string, opts: { state?: string; city?: string } = {}) {
  return apiGet<CatalogVendorDetail>(`/catalog/vendors/${encodeURIComponent(slug)}${toQuery(opts)}`, null);
}

export function listCatalogTherapists(
  opts: {
    page?: number;
    pageSize?: number;
    categoryId?: string;
    subcategoryId?: string;
    vendorId?: string;
    branchId?: string;
    search?: string;
    /** See `listCatalogDeals`'s identical param doc comment. */
    latitude?: number;
    longitude?: number;
  } = {},
) {
  return apiGet<CatalogTherapist[]>(`/catalog/therapists${toQuery(opts)}`, null);
}

export function getCatalogTherapist(id: string) {
  return apiGet<CatalogTherapist>(`/catalog/therapists/${id}`, null);
}

// ─── CMS (About Us / Contact Us) — same "no auth, one function per public GET" discipline as
// every other function in this file. Blog Post reads live in `apps/msd/src/blog/blog.ts`
// instead (that module's own doc comment anticipates being the one file that swaps from static
// data to the real API), so they are not duplicated here. ─────────────────────────────────────

/** Singleton row (see msd-api's `AboutUsContent` schema doc comment) — `GET /catalog/about-us`
 *  always returns the current saved content, created on first admin save. */
export interface CatalogAboutUs {
  id: string;
  heroTitle: string;
  heroSubtitle: string;
  missionStatement: string;
  body: BlogBlock[];
  metaTitle?: string | null;
  metaDescription?: string | null;
  updatedAt: string;
  mediaImages: MediaImage[];
}

export interface CatalogSocialLink {
  platform: string;
  url: string;
}

/** Same singleton-row convention as `CatalogAboutUs` above — no media (a contact page has no
 *  gallery need, see msd-api's `ContactUsContent` schema doc comment). */
export interface CatalogContactUs {
  id: string;
  address: string;
  phone: string;
  email: string;
  mapEmbedUrl: string;
  socialLinks: CatalogSocialLink[];
  metaTitle?: string | null;
  metaDescription?: string | null;
  updatedAt: string;
}

export function getCatalogAboutUs() {
  return apiGet<CatalogAboutUs>('/catalog/about-us', null);
}

export function getCatalogContactUs() {
  return apiGet<CatalogContactUs>('/catalog/contact-us', null);
}
