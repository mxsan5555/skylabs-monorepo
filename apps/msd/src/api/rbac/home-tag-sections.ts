import { apiDelete, apiGet, apiPost, apiPut } from './client';
import { GLOBAL_STATE_SENTINEL, toQuery } from './home-hero';

export const MIN_ELIGIBLE_ITEMS_PER_TAG_SECTION = 1;

export type HomeTagSectionTag = 'NEW' | 'DEAL' | 'HOT_DEAL' | 'EXPIRE_SOON';

/** Admin row order (New, Deal, Hot Deal, Expire soon) — the storefront rails use their own,
 *  different order (New, Hot Deal, Deal, Expire soon; PLANNING.md §7.1). */
export const ADMIN_TAG_ORDER: HomeTagSectionTag[] = ['NEW', 'DEAL', 'HOT_DEAL', 'EXPIRE_SOON'];

export const TAG_TITLES: Record<HomeTagSectionTag, string> = {
  NEW: 'New',
  DEAL: 'Deal',
  HOT_DEAL: 'Hot Deal',
  EXPIRE_SOON: 'Expire Soon',
};

export type SectionStatus = 'LIVE' | 'DRAFT' | 'DISABLED';

/** The raw, always-persisted row `PUT /sections` upserts and returns — unlike `HomeTagSectionRow`
 *  below, `id` is never null here (an upsert always has a real row to return). */
export interface HomeTagSectionRecord {
  id: string;
  state: string | null;
  tag: HomeTagSectionTag;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One of the 4 fixed tag rows for a state; `id: null` when the admin has never touched this
 *  (state, tag) pair — the Enabled switch upserts the real row on first use. */
export interface HomeTagSectionRow {
  id: string | null;
  state: string | null;
  tag: HomeTagSectionTag;
  title: string;
  isEnabled: boolean;
  itemCount: number;
  eligibleCount: number;
  minimumRequired: number;
  status: SectionStatus;
  updatedAt: string | null;
}

/** One row of the overview table; `state: null` is Global / Default. */
export interface HomeTagSectionOverviewRow {
  state: string | null;
  sectionsEnabled: number;
  liveSections: number;
  updatedAt: string | null;
}

export interface HomeTagSectionItem {
  id: string;
  homeTagSectionId: string;
  dealId: string;
  sortOrder: number;
  createdAt: string;
  itemEligible: boolean;
  ineligibleReason: string | null;
  image: string | null;
  price: string;
  deal: {
    id: string;
    title: string;
    slug: string;
    status: string;
    approvalStatus: string;
    salePrice: string;
    discountPercent: number | null;
    endDate: string | null;
    vendor: { id: string; businessName: string; status: string };
    branch: { id: string; name: string; state: string | null; isActive: boolean };
  };
}

/** Builder/state URL segment: `global` for Global / Default, else the state name — same
 *  convention as `home-hero.ts`'s `sliderPath`/`stateFromSlug`. */
export const GLOBAL_SLUG = 'global';
export const stateSlug = (state: string | null) => (state === null ? GLOBAL_SLUG : encodeURIComponent(state));
export const stateFromSlug = (slug: string): string | null => (slug === GLOBAL_SLUG ? null : slug);
export const statePath = (state: string | null) => `/account/masters/home-tag-sections/${stateSlug(state)}`;
export const sectionPath = (state: string | null, tag: HomeTagSectionTag) => `${statePath(state)}/${tag}`;

export function listHomeTagSectionOverview(token: string | null) {
  return apiGet<HomeTagSectionOverviewRow[]>('/home-tag-sections/overview', token);
}

export function listHomeTagSectionStates(token: string | null) {
  return apiGet<string[]>('/home-tag-sections/states', token);
}

/** Always returns all 4 rows, in `ADMIN_TAG_ORDER`. */
export function listHomeTagSections(token: string | null, state: string | null) {
  return apiGet<HomeTagSectionRow[]>(
    `/home-tag-sections/sections${toQuery({ state: state ?? GLOBAL_STATE_SENTINEL })}`,
    token,
  );
}

export function setHomeTagSectionEnabled(token: string | null, state: string | null, tag: HomeTagSectionTag, isEnabled: boolean) {
  return apiPut<HomeTagSectionRecord>('/home-tag-sections/sections', token, { state, tag, isEnabled });
}

export function listHomeTagSectionItems(token: string | null, sectionId: string) {
  return apiGet<HomeTagSectionItem[]>(`/home-tag-sections/sections/${sectionId}/items`, token);
}

export function addHomeTagSectionItem(token: string | null, sectionId: string, dealId: string) {
  return apiPost<HomeTagSectionItem>(`/home-tag-sections/sections/${sectionId}/items`, token, { dealId });
}

export function removeHomeTagSectionItem(token: string | null, itemId: string) {
  return apiDelete<null>(`/home-tag-sections/items/${itemId}`, token);
}

/** Saves a section's whole item order at once. */
export function reorderHomeTagSectionItems(token: string | null, sectionId: string, itemIds: string[]) {
  return apiPut<{ reordered: boolean }>(`/home-tag-sections/sections/${sectionId}/items/order`, token, { itemIds });
}
