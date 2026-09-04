import { apiGet } from './client';
import type { MediaImage, MediaVideo } from '../media';

/**
 * Superadmin, cross-vendor, READ-ONLY oversight client — Product is now vendor-owned
 * (`vendorId` required, see the direct-category-access migration). Create/update/delete/status
 * are vendor-scoped only (self-service `/vendors/me/products`, admin-on-behalf
 * `/vendors/:id/products` — see products.routes.ts/vendors.routes.ts in msd-api), never this
 * `/products` client, which only ever exposes `GET /products` and `GET /products/:id`.
 */
export interface Product {
  id: string;
  name: string;
  slug: string;
  vendorId: string;
  brand?: string | null;
  categoryId: string;
  subcategoryId: string | null;
  description?: string | null;
  summary?: string | null;
  benefits?: string[] | null;
  howToUse?: string[] | null;
  ingredients?: string | null;
  returnPolicy?: string | null;
  image?: string | null;
  gallery?: string[] | null;
  imageAlt?: string | null;
  badge?: string | null;
  price: string;
  originalPrice?: string | null;
  discount?: number | null;
  isNew: boolean;
  isFeatured: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  category?: { id: string; name: string };
  subcategory?: { id: string; name: string } | null;
  /** Uploaded media (shared Deal/Product/Therapist system) — the authoritative image/video
   *  source going forward; `image`/`gallery` above are the legacy pasted-URL fields, kept only
   *  for rows that predate this table (see `resolveProductMedia` in `utils/media.ts`). */
  mediaImages?: MediaImage[];
  mediaVideo?: MediaVideo | null;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export function listProducts(
  token: string | null,
  opts: {
    page?: number;
    pageSize?: number;
    search?: string;
    /** Superadmin oversight only — narrows to one vendor's products. */
    vendorId?: string;
    categoryId?: string;
    subcategoryId?: string;
    status?: 'active' | 'inactive';
  } = {},
) {
  return apiGet<Product[]>(`/products${toQuery(opts)}`, token);
}

export function getProduct(token: string | null, id: string) {
  return apiGet<Product>(`/products/${id}`, token);
}
