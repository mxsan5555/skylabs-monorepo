import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export interface PopularTreatmentGroup {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { treatments: number };
}

export interface PopularTreatmentGroupInput {
  name: string;
  slug: string;
  sortOrder?: number;
}

export interface PopularTreatment {
  id: string;
  groupId: string;
  name: string;
  slug: string;
  categoryId: string | null;
  subcategoryId: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  group: { id: string; name: string; slug: string; isActive: boolean };
  category: { id: string; name: string; slug: string } | null;
  subcategory: { id: string; name: string; slug: string } | null;
}

export interface PopularTreatmentInput {
  name: string;
  slug: string;
  groupId: string;
  categoryId?: string | null;
  subcategoryId?: string | null;
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

// ─── Groups ────────────────────────────────────────────────────────────────────────────────

export function listPopularTreatmentGroups(token: string | null, opts: { page?: number; pageSize?: number; search?: string } = {}) {
  return apiGet<PopularTreatmentGroup[]>(`/popular-treatments/groups${toQuery(opts)}`, token);
}

/** Unfiltered — every group (active or not), for the Treatment form's Group picker. */
export function listAllPopularTreatmentGroups(token: string | null) {
  return apiGet<PopularTreatmentGroup[]>('/popular-treatments/groups/all', token);
}

export function createPopularTreatmentGroup(token: string | null, input: PopularTreatmentGroupInput) {
  return apiPost<PopularTreatmentGroup>('/popular-treatments/groups', token, input);
}

export function updatePopularTreatmentGroup(token: string | null, id: string, input: Partial<PopularTreatmentGroupInput>) {
  return apiPatch<PopularTreatmentGroup>(`/popular-treatments/groups/${id}`, token, input);
}

export function setPopularTreatmentGroupStatus(token: string | null, id: string, isActive: boolean) {
  return apiPatch<PopularTreatmentGroup>(`/popular-treatments/groups/${id}/status`, token, { isActive });
}

export function deletePopularTreatmentGroup(token: string | null, id: string) {
  return apiDelete<null>(`/popular-treatments/groups/${id}`, token);
}

// ─── Treatments ────────────────────────────────────────────────────────────────────────────

export function listPopularTreatments(token: string | null, opts: { page?: number; pageSize?: number; search?: string; groupId?: string } = {}) {
  return apiGet<PopularTreatment[]>(`/popular-treatments${toQuery(opts)}`, token);
}

export function createPopularTreatment(token: string | null, input: PopularTreatmentInput) {
  return apiPost<PopularTreatment>('/popular-treatments', token, input);
}

export function updatePopularTreatment(token: string | null, id: string, input: Partial<PopularTreatmentInput>) {
  return apiPatch<PopularTreatment>(`/popular-treatments/${id}`, token, input);
}

export function setPopularTreatmentStatus(token: string | null, id: string, isActive: boolean) {
  return apiPatch<PopularTreatment>(`/popular-treatments/${id}/status`, token, { isActive });
}

export function deletePopularTreatment(token: string | null, id: string) {
  return apiDelete<null>(`/popular-treatments/${id}`, token);
}
