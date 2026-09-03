import { apiDelete, apiGet, apiPatch, apiPost } from './client';
import type { MediaImage } from '../media';

/** `type`/`isPopular` only ever apply to a top-level row (`parentId: null`) — a subcategory
 *  inherits its parent's type by join and never carries its own (see msd-api's
 *  `category.schema.ts` doc comment). Both are `undefined`/absent on a subcategory row. */
export type CategoryType = 'SERVICE' | 'PRODUCT' | 'THERAPY';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  parentId: string | null;
  sortOrder: number;
  type?: CategoryType | null;
  isPopular?: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  parent?: { id: string; name: string } | null;
  _count?: { children: number };
  /** Populated by the admin list/get endpoints (see `apps/msd/src/api/media.ts`'s `'category'`
   *  entity type + `MediaUploader`) — empty/undefined for a category with no images yet. Image
   *  only; Category has no video adapter on the backend. */
  mediaImages?: MediaImage[];
}

export interface CategoryInput {
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
  sortOrder?: number;
  /** Required by the backend when `parentId` is omitted (top-level category); ignored/omitted
   *  for a subcategory. */
  type?: CategoryType;
  isPopular?: boolean;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export function listCategories(
  token: string | null,
  opts: {
    page?: number;
    pageSize?: number;
    search?: string;
    /** 'top' = Categories (parentId: null); 'sub' = Sub Categories (depth 1); 'leaf' = Category
     *  Types (depth 2, the new Type tier — a Category row whose parent itself has a parent). */
    scope?: 'top' | 'sub' | 'leaf';
    parentId?: string;
    type?: CategoryType;
    vendorId?: string;
  } = {},
) {
  return apiGet<Category[]>(`/categories${toQuery(opts)}`, token);
}

export function createCategory(token: string | null, input: CategoryInput) {
  return apiPost<Category>('/categories', token, input);
}

export function updateCategory(token: string | null, id: string, input: Partial<CategoryInput>) {
  return apiPatch<Category>(`/categories/${id}`, token, input);
}

export function setCategoryStatus(token: string | null, id: string, isActive: boolean) {
  return apiPatch<Category>(`/categories/${id}/status`, token, { isActive });
}

export function deleteCategory(token: string | null, id: string) {
  return apiDelete<null>(`/categories/${id}`, token);
}
