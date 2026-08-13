import { apiGet } from './rbac/client';

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
}

export interface CatalogDeal {
  id: string;
  title: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
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
}

/** `Branch.openingHours` shape — keys are lowercase 3-letter day codes (`mon`…`sun`), values are
 *  either `"HH:MM-HH:MM"` or `"closed"`. Absent (`null`) for branches that haven't set hours yet. */
export type CatalogOpeningHours = Record<string, string>;

export interface CatalogVendorTherapist {
  id: string;
  name: string;
  specialization: string | null;
  bio: string | null;
  experienceYears: number | null;
  photoUrl: string | null;
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
