import { apiGet } from './rbac/client';
import type { MediaImage, MediaVideo } from './media';

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

export interface CatalogCategoryWithChildren extends CatalogCategory {
  children: CatalogCategory[];
}

export interface CatalogDealSummary {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  image?: string | null;
  imageAlt?: string | null;
}

export interface CatalogProductSummary extends CatalogDealSummary {
  brand?: string | null;
  mediaImages?: MediaImage[];
  mediaVideo?: MediaVideo | null;
}

/** A service Deal's own duration/price menu entry — a real child row (DealPackage), never a
 *  sibling Deal row. Only active packages are ever included here. Empty for a product deal (no
 *  duration/package concept applies) or a not-yet-migrated legacy service deal. */
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
  /** A synced "from price"/default-duration display cache (kept in sync with the cheapest
   *  active `packages[]` entry server-side — see DealPackage's own schema doc comment in
   *  msd-api) — accurate for listing/sort/filter display, but NEVER the authoritative booking
   *  price for a service deal that has packages; the customer's selected `packages[].id` is. */
  originalPrice: string;
  salePrice: string;
  discountPercent: number | null;
  durationMinutes: number | null;
  images: string[] | null;
  category: CatalogCategory | null;
  subcategory: CatalogCategory | null;
  service: CatalogDealSummary | null;
  product: CatalogProductSummary | null;
  vendor: { id: string; slug: string | null; businessName: string | null; city: string | null; logoUrl: string | null } | null;
  /** `latitude`/`longitude` are Decimal → string over the wire (same convention as
   *  originalPrice/salePrice below), and nullable — most branches don't have coordinates set
   *  yet. Never fabricate a value when these are null; treat as "location not available". */
  branch: { id: string; name: string; city: string | null; address: string | null; latitude: string | null; longitude: string | null } | null;
  packages: CatalogDealPackage[];
  mediaImages?: MediaImage[];
  mediaVideo?: MediaVideo | null;
}

/** `Branch.openingHours` shape — keys are lowercase 3-letter day codes (`mon`…`sun`), values are
 *  either `"HH:MM-HH:MM"` or `"closed"`. Absent (`null`) for branches that haven't set hours yet. */
export type CatalogOpeningHours = Record<string, string>;

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
}

/** The flat, independently-browsable Therapist listing entry (`GET /catalog/therapists`) —
 *  unlike `CatalogVendorTherapist` above (nested under a vendor storefront), this also carries
 *  `vendor`/`branch`, since a customer browsing Therapists directly never picks a Deal/vendor
 *  first (see msd-api's PUBLIC_THERAPIST_LISTING_SELECT doc comment). */
export interface CatalogTherapist extends CatalogVendorTherapist {
  vendor: { id: string; slug: string | null; businessName: string | null; city: string | null; logoUrl: string | null } | null;
  branch: { id: string; name: string; city: string | null; address: string | null; latitude: string | null; longitude: string | null } | null;
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
  type?: 'service' | 'product';
  search?: string;
  sort?: 'newest' | 'discount';
  minPrice?: number;
  maxPrice?: number;
} = {}) {
  return apiGet<CatalogDeal[]>(`/catalog/deals${toQuery(opts)}`, null);
}

export function getCatalogDeal(id: string) {
  return apiGet<CatalogDeal>(`/catalog/deals/${id}`, null);
}

export function getCatalogVendor(slug: string) {
  return apiGet<CatalogVendorDetail>(`/catalog/vendors/${encodeURIComponent(slug)}`, null);
}

export function listCatalogTherapists(opts: { page?: number; pageSize?: number; vendorId?: string; branchId?: string; search?: string } = {}) {
  return apiGet<CatalogTherapist[]>(`/catalog/therapists${toQuery(opts)}`, null);
}

export function getCatalogTherapist(id: string) {
  return apiGet<CatalogTherapist>(`/catalog/therapists/${id}`, null);
}
