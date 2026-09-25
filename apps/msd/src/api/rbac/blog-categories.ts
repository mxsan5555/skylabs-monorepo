import { apiDelete, apiGet, apiPatch, apiPost } from './client';

/** Mirrors msd-api's `BlogCategory` model — no separate `/status` route (unlike Category/Faq):
 *  `isActive` is a plain field on the same `PATCH /blog-categories/{id}` route as every other
 *  field (see blog-categories.routes.ts's own doc comment). */
export interface BlogCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BlogCategoryInput {
  name: string;
  slug: string;
  description?: string;
  sortOrder: number;
  isActive?: boolean;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export function listBlogCategories(
  token: string | null,
  opts: { page?: number; pageSize?: number; search?: string } = {},
) {
  return apiGet<BlogCategory[]>(`/blog-categories${toQuery(opts)}`, token);
}

export function getBlogCategory(token: string | null, id: string) {
  return apiGet<BlogCategory>(`/blog-categories/${id}`, token);
}

export function createBlogCategory(token: string | null, input: BlogCategoryInput) {
  return apiPost<BlogCategory>('/blog-categories', token, input);
}

export function updateBlogCategory(token: string | null, id: string, input: Partial<BlogCategoryInput>) {
  return apiPatch<BlogCategory>(`/blog-categories/${id}`, token, input);
}

export function deleteBlogCategory(token: string | null, id: string) {
  return apiDelete<null>(`/blog-categories/${id}`, token);
}
