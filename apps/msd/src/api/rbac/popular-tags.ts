import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export interface PopularTag {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { categories: number; deals: number; products: number; therapists: number };
}

export interface PopularTagInput {
  name: string;
  slug: string;
}

export type PopularTagTargetType = 'category' | 'deal' | 'product' | 'therapist';

export interface PopularTagMappings {
  categories: { id: string; name: string }[];
  deals: { id: string; title: string }[];
  products: { id: string; name: string }[];
  therapists: { id: string; personName: string }[];
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export function listPopularTags(token: string | null, opts: { page?: number; pageSize?: number; search?: string } = {}) {
  return apiGet<PopularTag[]>(`/popular-tags${toQuery(opts)}`, token);
}

export function createPopularTag(token: string | null, input: PopularTagInput) {
  return apiPost<PopularTag>('/popular-tags', token, input);
}

export function updatePopularTag(token: string | null, id: string, input: Partial<PopularTagInput>) {
  return apiPatch<PopularTag>(`/popular-tags/${id}`, token, input);
}

export function setPopularTagStatus(token: string | null, id: string, isActive: boolean) {
  return apiPatch<PopularTag>(`/popular-tags/${id}/status`, token, { isActive });
}

export function deletePopularTag(token: string | null, id: string) {
  return apiDelete<null>(`/popular-tags/${id}`, token);
}

export function listPopularTagMappings(token: string | null, id: string) {
  return apiGet<PopularTagMappings>(`/popular-tags/${id}/mappings`, token);
}

export function mapPopularTag(token: string | null, id: string, targetType: PopularTagTargetType, targetId: string) {
  return apiPost(`/popular-tags/${id}/mappings`, token, { targetType, targetId });
}

export function unmapPopularTag(token: string | null, id: string, targetType: PopularTagTargetType, targetId: string) {
  return apiDelete<{ unmapped: boolean }>(`/popular-tags/${id}/mappings/${targetType}/${targetId}`, token);
}
