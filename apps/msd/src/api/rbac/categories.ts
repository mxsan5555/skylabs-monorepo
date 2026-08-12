import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  parent?: { id: string; name: string } | null;
  _count?: { children: number };
}

export interface CategoryInput {
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
  sortOrder?: number;
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
  opts: { page?: number; pageSize?: number; search?: string; scope?: 'top' | 'sub'; parentId?: string } = {},
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
