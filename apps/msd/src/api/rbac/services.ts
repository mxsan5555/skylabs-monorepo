import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export interface Service {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  subcategoryId: string | null;
  description?: string | null;
  image?: string | null;
  imageAlt?: string | null;
  defaultDurationMinutes?: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  category?: { id: string; name: string };
  subcategory?: { id: string; name: string } | null;
}

export interface ServiceInput {
  name: string;
  slug: string;
  categoryId: string;
  subcategoryId?: string;
  description?: string;
  image?: string;
  imageAlt?: string;
  defaultDurationMinutes?: number;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export function listServices(
  token: string | null,
  opts: { page?: number; pageSize?: number; search?: string; categoryId?: string; subcategoryId?: string; status?: 'active' | 'inactive' } = {},
) {
  return apiGet<Service[]>(`/services${toQuery(opts)}`, token);
}

export function createService(token: string | null, input: ServiceInput) {
  return apiPost<Service>('/services', token, input);
}

export function updateService(token: string | null, id: string, input: Partial<ServiceInput>) {
  return apiPatch<Service>(`/services/${id}`, token, input);
}

export function setServiceStatus(token: string | null, id: string, isActive: boolean) {
  return apiPatch<Service>(`/services/${id}/status`, token, { isActive });
}

export function deleteService(token: string | null, id: string) {
  return apiDelete<null>(`/services/${id}`, token);
}
