import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export const MIN_ELIGIBLE_SLIDES = 5;

export interface HomeHeroSlide {
  id: string;
  dealId: string;
  state: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  dealEligible: boolean;
  deal: {
    id: string;
    title: string;
    slug: string;
    status: string;
    approvalStatus: string;
    vendor: { id: string; businessName: string; status: string };
    branch: { id: string; name: string; state: string | null; isActive: boolean };
  };
}

export interface HomeHeroSlideInput {
  dealId: string;
  state?: string | null;
  sortOrder?: number;
}

export interface EligibleCount {
  state: string | null;
  eligibleCount: number;
  minimumRequired: number;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

/** A URL query string can't carry a literal `null`, so the Global/Default slider (DB `state:
 *  null`) is requested via the sentinel `"__global__"` — distinct from omitting `state` entirely
 *  (every state, unfiltered admin list). Mirrors `home-hero.routes.ts`'s own sentinel handling. */
export const GLOBAL_STATE_SENTINEL = '__global__';

export function listHomeHeroSlides(
  token: string | null,
  opts: { page?: number; pageSize?: number; state?: string | null } = {},
) {
  const { state, ...rest } = opts;
  return apiGet<HomeHeroSlide[]>(
    `/home-hero/slides${toQuery({ ...rest, ...(state !== undefined ? { state: state === null ? GLOBAL_STATE_SENTINEL : state } : {}) })}`,
    token,
  );
}

export function listHomeHeroStates(token: string | null) {
  return apiGet<string[]>('/home-hero/states', token);
}

export function getHomeHeroEligibleCount(token: string | null, state: string | null) {
  return apiGet<EligibleCount>(`/home-hero/eligible-count${toQuery({ state: state ?? GLOBAL_STATE_SENTINEL })}`, token);
}

export function createHomeHeroSlide(token: string | null, input: HomeHeroSlideInput) {
  return apiPost<HomeHeroSlide>('/home-hero/slides', token, input);
}

export function updateHomeHeroSlide(token: string | null, id: string, input: Partial<HomeHeroSlideInput>) {
  return apiPatch<HomeHeroSlide>(`/home-hero/slides/${id}`, token, input);
}

export function setHomeHeroSlideStatus(token: string | null, id: string, isActive: boolean) {
  return apiPatch<HomeHeroSlide>(`/home-hero/slides/${id}/status`, token, { isActive });
}

export function deleteHomeHeroSlide(token: string | null, id: string) {
  return apiDelete<null>(`/home-hero/slides/${id}`, token);
}
