import { apiDelete, apiGet, apiPatch, apiPost } from './client';
import type { MediaImage } from '../media';

export type PromotionDestinationType = 'ROUTE' | 'CATEGORY' | 'DEAL';

export const PROMOTION_ROUTE_ALLOW_LIST = [
  '/',
  '/explore',
  '/categories',
  '/products',
  '/therapists',
  '/become-member',
  '/how-it-works',
] as const;

export interface Promotion {
  id: string;
  title: string;
  description: string | null;
  buttonLabel: string | null;
  destinationType: PromotionDestinationType;
  destinationRoute: string | null;
  categoryId: string | null;
  dealId: string | null;
  sortOrder: number;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  category: { id: string; name: string; slug: string; isActive: boolean } | null;
  deal: { id: string; title: string; slug: string; status: string; approvalStatus: string } | null;
  mediaImages?: MediaImage[];
}

export interface PromotionInput {
  title: string;
  description?: string | null;
  buttonLabel?: string | null;
  destinationType: PromotionDestinationType;
  destinationRoute?: string | null;
  categoryId?: string | null;
  dealId?: string | null;
  sortOrder?: number;
  startDate?: string | null;
  endDate?: string | null;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export function listPromotions(token: string | null, opts: { page?: number; pageSize?: number; search?: string } = {}) {
  return apiGet<Promotion[]>(`/promotions${toQuery(opts)}`, token);
}

export function getPromotion(token: string | null, id: string) {
  return apiGet<Promotion>(`/promotions/${id}`, token);
}

export function createPromotion(token: string | null, input: PromotionInput) {
  return apiPost<Promotion>('/promotions', token, input);
}

export function updatePromotion(token: string | null, id: string, input: Partial<PromotionInput>) {
  return apiPatch<Promotion>(`/promotions/${id}`, token, input);
}

export function setPromotionStatus(token: string | null, id: string, isActive: boolean) {
  return apiPatch<Promotion>(`/promotions/${id}/status`, token, { isActive });
}

export function deletePromotion(token: string | null, id: string) {
  return apiDelete<null>(`/promotions/${id}`, token);
}
