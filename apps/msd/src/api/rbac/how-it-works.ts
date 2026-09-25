import { apiDelete, apiGet, apiPatch, apiPost } from './client';

/** Singleton row (`id` is always the literal string `"singleton"`) — the public "How It Works"
 *  page's hero copy only; the numbered steps are the separate `HowItWorksStep` CRUD below. */
export interface HowItWorksContent {
  id: string;
  heroTitle: string;
  heroSubtitle: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  updatedAt: string;
}

export interface HowItWorksContentInput {
  heroTitle?: string;
  heroSubtitle?: string;
  metaTitle?: string;
  metaDescription?: string;
}

/** A flat, reorderable list of numbered steps — same "Active/Inactive + manual sortOrder"
 *  convention as Faq, plus `PATCH /how-it-works/steps/reorder`. */
export interface HowItWorksStep {
  id: string;
  title: string;
  description: string;
  icon?: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HowItWorksStepInput {
  title: string;
  description: string;
  icon?: string;
  sortOrder: number;
  isActive?: boolean;
}

export function getHowItWorksContent(token: string | null) {
  return apiGet<HowItWorksContent>('/how-it-works', token);
}

export function updateHowItWorksContent(token: string | null, input: HowItWorksContentInput) {
  return apiPatch<HowItWorksContent>('/how-it-works', token, input);
}

export function listHowItWorksSteps(token: string | null) {
  return apiGet<HowItWorksStep[]>('/how-it-works/steps', token);
}

export function createHowItWorksStep(token: string | null, input: HowItWorksStepInput) {
  return apiPost<HowItWorksStep>('/how-it-works/steps', token, input);
}

export function updateHowItWorksStep(token: string | null, id: string, input: Partial<HowItWorksStepInput>) {
  return apiPatch<HowItWorksStep>(`/how-it-works/steps/${id}`, token, input);
}

export function deleteHowItWorksStep(token: string | null, id: string) {
  return apiDelete<null>(`/how-it-works/steps/${id}`, token);
}

/** `orderedStepIds` must contain exactly the current set of step ids (see msd-api's
 *  `HowItWorksStepReorderSchema` doc comment) — the server sets each row's `sortOrder` to its
 *  index in the array in one transaction. */
export function reorderHowItWorksSteps(token: string | null, orderedStepIds: string[]) {
  return apiPatch<{ reordered: boolean }>('/how-it-works/steps/reorder', token, { stepIds: orderedStepIds });
}
