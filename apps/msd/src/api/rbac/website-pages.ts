import { apiGet, apiPatch } from './client';
import type { BlogBlock } from './blog-posts';

export type WebsitePageStatus = 'DRAFT' | 'PUBLISHED';

/** The 4 fixed legal pages (Privacy Policy/Terms of Service/Accessibility/Cookie Policy) —
 *  `GET`/`PATCH` only, no create/delete (see msd-api's website-pages.routes.ts doc comment).
 *  `slug` is deliberately not editable — it's the page's stable public URL key. */
export interface WebsitePage {
  id: string;
  slug: string;
  title: string;
  content: BlogBlock[];
  status: WebsitePageStatus;
  metaTitle?: string | null;
  metaDescription?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebsitePageInput {
  title?: string;
  content?: BlogBlock[];
  status?: WebsitePageStatus;
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

export function listWebsitePages(
  token: string | null,
  opts: { page?: number; pageSize?: number; search?: string } = {},
) {
  return apiGet<WebsitePage[]>(`/website-pages${toQuery(opts)}`, token);
}

export function getWebsitePage(token: string | null, id: string) {
  return apiGet<WebsitePage>(`/website-pages/${id}`, token);
}

export function updateWebsitePage(token: string | null, id: string, input: WebsitePageInput) {
  return apiPatch<WebsitePage>(`/website-pages/${id}`, token, input);
}
