import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export interface Faq {
  id: string;
  question: string;
  answer: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FaqInput {
  question: string;
  answer: string;
  sortOrder: number;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export function listFaqs(
  token: string | null,
  opts: { page?: number; pageSize?: number; search?: string } = {},
) {
  return apiGet<Faq[]>(`/faqs${toQuery(opts)}`, token);
}

export function getFaq(token: string | null, id: string) {
  return apiGet<Faq>(`/faqs/${id}`, token);
}

export function createFaq(token: string | null, input: FaqInput) {
  return apiPost<Faq>('/faqs', token, input);
}

export function updateFaq(token: string | null, id: string, input: Partial<FaqInput>) {
  return apiPatch<Faq>(`/faqs/${id}`, token, input);
}

export function setFaqStatus(token: string | null, id: string, isActive: boolean) {
  return apiPatch<Faq>(`/faqs/${id}/status`, token, { isActive });
}

export function deleteFaq(token: string | null, id: string) {
  return apiDelete<null>(`/faqs/${id}`, token);
}
