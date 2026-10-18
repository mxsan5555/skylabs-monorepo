import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './client';

export const MIN_ELIGIBLE_SLIDES = 5;

export type StateItemType = 'deal' | 'product';

export interface HomeHeroSlide {
  id: string;
  dealId: string | null;
  productId: string | null;
  state: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  itemType: StateItemType;
  /** Customers can see the slide's deal or product right now. */
  itemEligible: boolean;
  /** Why they cannot ("Branch paused"), or null. */
  ineligibleReason: string | null;
  /** Primary image storage key and current price of the item. */
  image: string | null;
  price: string | null;
  deal: {
    id: string;
    title: string;
    slug: string;
    status: string;
    approvalStatus: string;
    vendor: { id: string; businessName: string; status: string };
    branch: { id: string; name: string; state: string | null; isActive: boolean };
  } | null;
  product: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    vendor: { id: string; businessName: string; status: string };
  } | null;
}

export interface HomeHeroSlideInput {
  itemType: StateItemType;
  itemId: string;
  state: string | null;
  sortOrder?: number;
}

export type SliderStatus = 'LIVE' | 'DRAFT' | 'EMPTY';

/** One row of the overview table (D28); `state: null` is Global / Default. */
export interface SliderOverviewRow {
  state: string | null;
  status: SliderStatus;
  eligibleCount: number;
  minimumRequired: number;
  deals: number;
  products: number;
  updatedAt: string | null;
}

/** Builder URL segment for a slider: `global` for Global / Default, else the state name. */
export const GLOBAL_SLUG = 'global';
export const sliderPath = (state: string | null) =>
  `/account/masters/home-hero/${state === null ? GLOBAL_SLUG : encodeURIComponent(state)}`;
export const stateFromSlug = (slug: string): string | null => (slug === GLOBAL_SLUG ? null : slug);

export interface EligibleCount {
  state: string | null;
  eligibleCount: number;
  minimumRequired: number;
}

/** One search result from `GET /home-hero/search-items` or `/promotions/search-items`. */
export interface StateItem {
  type: StateItemType;
  id: string;
  title: string;
  memberName: string;
  branchName: string | null;
  price: string;
  image: string | null;
  eligible: boolean;
}

export function toQuery(params: Record<string, string | number | undefined>): string {
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

/** Display title for a slide, whichever item it holds. */
export function slideTitle(slide: HomeHeroSlide): string {
  return slide.deal?.title ?? slide.product?.name ?? '';
}

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

/** Deals and products of a state; `state: null` searches every state (Global/Default). */
export function searchStateItems(
  token: string | null,
  base: '/home-hero' | '/promotions',
  opts: { state: string | null; q: string; type: StateItemType | 'all'; pageSize?: number; eligibleOnly?: boolean },
) {
  return apiGet<StateItem[]>(
    `${base}/search-items${toQuery({
      state: opts.state ?? undefined,
      q: opts.q,
      type: opts.type,
      pageSize: opts.pageSize,
      eligibleOnly: opts.eligibleOnly ? 'true' : undefined,
    })}`,
    token,
  );
}

export function listHomeHeroOverview(token: string | null) {
  return apiGet<SliderOverviewRow[]>('/home-hero/overview', token);
}

/** Saves the whole order of one slider at once. */
export function reorderHomeHeroSlides(token: string | null, state: string | null, slideIds: string[]) {
  return apiPut<{ reordered: boolean }>('/home-hero/slides/order', token, { state, slideIds });
}

export function createHomeHeroSlide(token: string | null, input: HomeHeroSlideInput) {
  return apiPost<HomeHeroSlide>('/home-hero/slides', token, input);
}

export function updateHomeHeroSlide(token: string | null, id: string, input: { sortOrder: number }) {
  return apiPatch<HomeHeroSlide>(`/home-hero/slides/${id}`, token, input);
}

export function setHomeHeroSlideStatus(token: string | null, id: string, isActive: boolean) {
  return apiPatch<HomeHeroSlide>(`/home-hero/slides/${id}/status`, token, { isActive });
}

export function deleteHomeHeroSlide(token: string | null, id: string) {
  return apiDelete<null>(`/home-hero/slides/${id}`, token);
}
