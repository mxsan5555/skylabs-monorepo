import { apiDelete, apiGet, apiPatch, apiPost } from './client';
import type { MediaImage } from '../media';
import { GLOBAL_STATE_SENTINEL, toQuery } from './home-hero';

/** CTA banners (the `Promotion` model; docs/msd/PLANNING.md §6). */
export type PromotionDestinationType = 'ROUTE' | 'CATEGORY' | 'DEAL' | 'PRODUCT';

export const PROMOTION_ROUTE_ALLOW_LIST = [
  '/',
  '/explore',
  '/categories',
  '/products',
  '/therapists',
  '/become-member',
  '/how-it-works',
] as const;

/** Named places on storefront pages (D25), with their console labels. */
export const BANNER_SLOTS = [
  { value: 'HOME_AFTER_DEALS', label: 'Home, after deals' },
  { value: 'HOME_AFTER_PRODUCTS', label: 'Home, after products' },
  { value: 'CATEGORY_TOP', label: 'Category page, top' },
  { value: 'EXPLORE_TOP', label: 'Explore, top' },
  { value: 'DEAL_BOTTOM', label: 'Deal page, bottom' },
  { value: 'PRODUCT_BOTTOM', label: 'Product page, bottom' },
] as const;
export type BannerSlot = (typeof BANNER_SLOTS)[number]['value'];

/** M3 colour roles (D24) and the `sky-cta-banner` / `sky-feature-card` `color` each maps to. */
export const BANNER_COLOR_ROLES = [
  { value: 'PRIMARY', label: 'Primary', color: 'primary' },
  { value: 'SECONDARY', label: 'Secondary', color: 'secondary' },
  { value: 'TERTIARY', label: 'Tertiary', color: 'tertiary' },
  { value: 'SURFACE', label: 'Surface', color: 'surface' },
  { value: 'SURFACE_HIGH', label: 'Surface high', color: 'surface-high' },
  { value: 'INVERSE', label: 'Inverse', color: 'inverse' },
] as const;
export type BannerColorRole = (typeof BANNER_COLOR_ROLES)[number]['value'];

/** Buttons take a strong fill only, so the button keeps 3:1 against any banner background. */
export const BANNER_BUTTON_ROLES = BANNER_COLOR_ROLES.filter((r) =>
  ['PRIMARY', 'SECONDARY', 'TERTIARY', 'INVERSE'].includes(r.value),
);

export function bannerColor(role: BannerColorRole): string {
  return BANNER_COLOR_ROLES.find((r) => r.value === role)?.color ?? 'primary';
}

export interface Promotion {
  id: string;
  title: string;
  description: string | null;
  buttonLabel: string | null;
  state: string | null;
  backgroundRole: BannerColorRole;
  buttonRole: BannerColorRole;
  destinationType: PromotionDestinationType;
  destinationRoute: string | null;
  categoryId: string | null;
  dealId: string | null;
  productId: string | null;
  sortOrder: number;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  category: { id: string; name: string; slug: string; isActive: boolean } | null;
  deal: { id: string; title: string; slug: string; status: string } | null;
  product: { id: string; name: string; slug: string; isActive: boolean } | null;
  placements: { slot: BannerSlot }[];
  mediaImages?: MediaImage[];
}

export interface PromotionInput {
  title: string;
  description?: string | null;
  buttonLabel: string;
  state: string | null;
  backgroundRole: BannerColorRole;
  buttonRole: BannerColorRole;
  placements: BannerSlot[];
  destinationType: PromotionDestinationType;
  destinationRoute?: string | null;
  categoryId?: string | null;
  dealId?: string | null;
  productId?: string | null;
  sortOrder?: number;
  startDate?: string | null;
  endDate?: string | null;
}

/** `state: undefined` = every banner, `null` = Global/Default only, a name = that state only. */
export function listPromotions(
  token: string | null,
  opts: { page?: number; pageSize?: number; search?: string; state?: string | null } = {},
) {
  const { state, ...rest } = opts;
  return apiGet<Promotion[]>(
    `/promotions${toQuery({ ...rest, ...(state !== undefined ? { state: state ?? GLOBAL_STATE_SENTINEL } : {}) })}`,
    token,
  );
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
