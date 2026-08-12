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
  vendor: { id: string; businessName: string | null; city: string | null; logoUrl: string | null } | null;
  branch: { id: string; name: string; city: string | null; address: string | null } | null;
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
  type?: 'service' | 'product';
  search?: string;
} = {}) {
  return apiGet<CatalogDeal[]>(`/catalog/deals${toQuery(opts)}`, null);
}

export function getCatalogDeal(id: string) {
  return apiGet<CatalogDeal>(`/catalog/deals/${id}`, null);
}
