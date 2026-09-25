import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export type CareersJobStatus = 'DRAFT' | 'PUBLISHED';

/** Singleton row (`id` is always the literal string `"singleton"`) — the public "Careers" page's
 *  hero copy only; the actual open roles are the separate `CareersJobListing` CRUD below. */
export interface CareersPageContent {
  id: string;
  heroTitle: string;
  heroSubtitle: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  updatedAt: string;
}

export interface CareersPageContentInput {
  heroTitle?: string;
  heroSubtitle?: string;
  metaTitle?: string;
  metaDescription?: string;
}

/** `status` reuses the same DRAFT/PUBLISHED flow as a Blog Post — set only via
 *  `setCareersJobStatus` (`PATCH /careers/jobs/{id}/status`), never as part of the main
 *  create/update payload (see msd-api's `CareersJobListingFieldsSchema` doc comment). */
export interface CareersJobListing {
  id: string;
  jobTitle: string;
  department: string;
  location: string;
  employmentType: string;
  description: string;
  responsibilities: string;
  requirements: string;
  applyUrl?: string | null;
  applyInstructions?: string | null;
  status: CareersJobStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CareersJobListingInput {
  jobTitle: string;
  department: string;
  location: string;
  employmentType: string;
  description: string;
  responsibilities: string;
  requirements: string;
  applyUrl?: string;
  applyInstructions?: string;
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

export function getCareersContent(token: string | null) {
  return apiGet<CareersPageContent>('/careers', token);
}

export function updateCareersContent(token: string | null, input: CareersPageContentInput) {
  return apiPatch<CareersPageContent>('/careers', token, input);
}

export function listCareersJobs(
  token: string | null,
  opts: { page?: number; pageSize?: number; search?: string; status?: CareersJobStatus } = {},
) {
  return apiGet<CareersJobListing[]>(`/careers/jobs${toQuery(opts)}`, token);
}

export function getCareersJob(token: string | null, id: string) {
  return apiGet<CareersJobListing>(`/careers/jobs/${id}`, token);
}

export function createCareersJob(token: string | null, input: CareersJobListingInput) {
  return apiPost<CareersJobListing>('/careers/jobs', token, input);
}

export function updateCareersJob(token: string | null, id: string, input: Partial<CareersJobListingInput>) {
  return apiPatch<CareersJobListing>(`/careers/jobs/${id}`, token, input);
}

export function setCareersJobStatus(token: string | null, id: string, status: CareersJobStatus) {
  return apiPatch<CareersJobListing>(`/careers/jobs/${id}/status`, token, { status });
}

export function deleteCareersJob(token: string | null, id: string) {
  return apiDelete<null>(`/careers/jobs/${id}`, token);
}
