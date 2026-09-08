import { apiDelete, apiGet, apiPatch, apiPost } from './client';
import type { MediaImage } from '../media';

export type BlogPostStatus = 'DRAFT' | 'PUBLISHED';

/** Discriminated union on `type` — kept structurally identical to the public frontend's own
 *  `BlogBlock` (`apps/msd/src/types/index.ts`) and msd-api's `blogBlockSchema`, but declared
 *  separately here since this app's admin types never share a module with its public-storefront
 *  types (same split as `Category`/`CategoryInput` vs the consumer catalogue's own types). */
export type BlogBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'quote'; text: string };

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  categorySlug: string;
  body: BlogBlock[];
  author: string;
  readMinutes: number;
  tags: string[];
  status: BlogPostStatus;
  publishedAt: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Populated by the admin list/get endpoints (see `apps/msd/src/api/media.ts`'s `'blog'`
   *  entity type + `MediaUploader`) — empty/undefined for a post with no cover image yet. */
  mediaImages?: MediaImage[];
}

export interface BlogPostInput {
  title: string;
  slug: string;
  excerpt: string;
  categorySlug: string;
  body: BlogBlock[];
  author: string;
  readMinutes: number;
  tags: string[];
  metaTitle?: string;
  metaDescription?: string;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export function listBlogPosts(
  token: string | null,
  opts: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: BlogPostStatus;
    categorySlug?: string;
  } = {},
) {
  return apiGet<BlogPost[]>(`/blog-posts${toQuery(opts)}`, token);
}

export function getBlogPost(token: string | null, id: string) {
  return apiGet<BlogPost>(`/blog-posts/${id}`, token);
}

export function createBlogPost(token: string | null, input: BlogPostInput) {
  return apiPost<BlogPost>('/blog-posts', token, input);
}

export function updateBlogPost(token: string | null, id: string, input: Partial<BlogPostInput>) {
  return apiPatch<BlogPost>(`/blog-posts/${id}`, token, input);
}

export function setBlogPostStatus(token: string | null, id: string, status: BlogPostStatus) {
  return apiPatch<BlogPost>(`/blog-posts/${id}/status`, token, { status });
}

export function deleteBlogPost(token: string | null, id: string) {
  return apiDelete<null>(`/blog-posts/${id}`, token);
}
