import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export interface Product {
  id: string;
  name: string;
  slug: string;
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
}

export interface ProductInput {
  name: string;
  slug: string;
  brand?: string;
  categoryId: string;
  subcategoryId?: string;
  description?: string;
  summary?: string;
  benefits?: string[];
  howToUse?: string[];
  ingredients?: string;
  returnPolicy?: string;
  image?: string;
  gallery?: string[];
  imageAlt?: string;
  badge?: string;
  price: string;
  originalPrice?: string;
  discount?: number;
  isNew?: boolean;
  isFeatured?: boolean;
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
  opts: { page?: number; pageSize?: number; search?: string; categoryId?: string; subcategoryId?: string; status?: 'active' | 'inactive' } = {},
) {
  return apiGet<Product[]>(`/products${toQuery(opts)}`, token);
}

export function createProduct(token: string | null, input: ProductInput) {
  return apiPost<Product>('/products', token, input);
}

export function updateProduct(token: string | null, id: string, input: Partial<ProductInput>) {
  return apiPatch<Product>(`/products/${id}`, token, input);
}

export function setProductStatus(token: string | null, id: string, isActive: boolean) {
  return apiPatch<Product>(`/products/${id}/status`, token, { isActive });
}

export function deleteProduct(token: string | null, id: string) {
  return apiDelete<null>(`/products/${id}`, token);
}
