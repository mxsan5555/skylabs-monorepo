import {
  getCatalogCategory,
  listCatalogCategories,
  listCatalogDeals,
  listCatalogFaqs,
  listCatalogLocations,
  listCatalogProducts,
  listCatalogSocialLinks,
  listCatalogTherapists,
  type CatalogCategoryWithChildren,
  type CatalogDeal,
  type CatalogFaq,
  type CatalogLocation,
  type CatalogProduct,
  type CatalogSocialMediaLink,
  type CatalogTherapist,
} from '../api/catalog';
import { ApiRequestError } from '../api/rbac/client';
import { HOME_DEALS_PAGE_SIZE, HOME_RAIL_SIZE } from '../app/pages/home/home-data';

/** Payload for key `shell` (read by `CatalogShellProvider`). */
export interface ShellData {
  categories: CatalogCategoryWithChildren[];
  locations: CatalogLocation[];
  socialLinks: CatalogSocialMediaLink[];
}

/** Payload for key `home` (read by `useHomeCatalog`). */
export interface HomeData {
  deals: CatalogDeal[];
  products: CatalogProduct[];
  therapists: CatalogTherapist[];
  faqs: CatalogFaq[];
}

/** Payload for key `categoryDataKey(slug, city)` (read by the category page). `category: null`
 *  means the slug does not exist; `deals` is empty for PRODUCT/THERAPY categories. */
export interface CategoryData {
  category: CatalogCategoryWithChildren | null;
  deals: CatalogDeal[];
}

/** Same deal page size the category page requests. */
export const CATEGORY_DEALS_PAGE_SIZE = 60;

/** Copies only `keys` that are present, so the embedded payload carries no `undefined` noise. */
function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

type Media = { mediaImages?: { storageKey: string; isPrimary?: boolean; sortOrder?: number }[]; mediaVideo?: { storageKey: string } | null };
/** `resolveDealMedia`/`resolveTherapistMedia` read only the storage key and ordering. */
const trimMedia = ({ mediaImages, mediaVideo }: Media) => ({
  ...(mediaImages ? { mediaImages: mediaImages.map((m) => pick(m, ['storageKey', 'isPrimary', 'sortOrder'])) } : {}),
  ...(mediaVideo !== undefined ? { mediaVideo: mediaVideo && { storageKey: mediaVideo.storageKey } } : {}),
});
const trimBranch = (b: CatalogDeal['branch']) => b && pick(b, ['id', 'name', 'city']);

/*
 * The payload is inlined into every prerendered page, so it carries only what the home and
 * category pages render: `toDealCardDeal`, `toProductCardDeal`, the home therapist slide, the
 * category page cards, `DealAddToCartDialog` (packages), `resolveDealMedia`/
 * `resolveTherapistMedia` and the ItemList JSON-LD. Long text (description, terms, notes,
 * policy, bio) never ships. The client refetches full records after hydration, so the objects
 * are typed (cast) as the full catalog types their consumers expect.
 */
export const trimDeal = (d: CatalogDeal): CatalogDeal =>
  ({
    ...pick(d, ['id', 'title', 'originalPrice', 'salePrice', 'discountPercent', 'durationMinutes', 'images', 'vendor', 'packages', 'popularTags', 'distanceKm']),
    // The home "Deals near you" tabs group deals by category id.
    ...(d.category !== undefined ? { category: d.category && pick(d.category, ['id', 'name', 'slug']) } : {}),
    ...(d.branch !== undefined ? { branch: trimBranch(d.branch) } : {}),
    ...trimMedia(d),
  }) as CatalogDeal;

export const trimProduct = (p: CatalogProduct): CatalogProduct =>
  pick(p, ['id', 'name', 'image', 'imageAlt', 'price', 'originalPrice', 'discount', 'vendor', 'popularTags']) as CatalogProduct;

export const trimTherapist = (t: CatalogTherapist): CatalogTherapist =>
  ({
    ...pick(t, ['id', 'therapistType', 'personName', 'photoUrl', 'packages', 'vendor', 'popularTags', 'distanceKm']),
    ...(t.branch !== undefined ? { branch: trimBranch(t.branch) } : {}),
    ...trimMedia(t),
  }) as CatalogTherapist;

const valueOr = <T,>(r: PromiseSettledResult<{ data: T[] | null | undefined }>): T[] =>
  r.status === 'fulfilled' ? (r.value.data ?? []) : [];

/** Categories, cities and social links; any failing call yields [] for that field. */
export async function loadShellData(): Promise<ShellData> {
  const [categories, locations, socialLinks] = await Promise.allSettled([
    listCatalogCategories(),
    listCatalogLocations(),
    listCatalogSocialLinks(),
  ]);
  return { categories: valueOr(categories), locations: valueOr(locations), socialLinks: valueOr(socialLinks) };
}

/** The home lists as `useHomeCatalog` fetches them with no visitor location. Rejects when a
 *  core list fails (so the caller can skip prerendering it); FAQs are non-critical and yield []. */
export async function loadHomeData(): Promise<HomeData> {
  const [deals, products, therapists, faqs] = await Promise.allSettled([
    listCatalogDeals({ pageSize: HOME_DEALS_PAGE_SIZE }),
    listCatalogProducts({ pageSize: HOME_RAIL_SIZE, sort: 'newest' }),
    listCatalogTherapists({ pageSize: HOME_RAIL_SIZE }),
    listCatalogFaqs(),
  ]);
  for (const r of [deals, products, therapists]) if (r.status === 'rejected') throw r.reason;
  return {
    deals: valueOr(deals).map(trimDeal),
    products: valueOr(products).map(trimProduct),
    therapists: valueOr(therapists).map(trimTherapist),
    faqs: valueOr(faqs),
  };
}

/** A category and its unfiltered ("All" tab) deals, optionally for one city. A 404 slug returns
 *  `{ category: null, deals: [] }`; any other failure rejects. */
export async function loadCategoryData(slug: string, city?: string, state?: string): Promise<CategoryData> {
  let category: CatalogCategoryWithChildren | null;
  try {
    category = (await getCatalogCategory(slug)).data ?? null;
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) return { category: null, deals: [] };
    throw err;
  }
  if (!category || category.type === 'PRODUCT' || category.type === 'THERAPY') return { category, deals: [] };
  const { data } = await listCatalogDeals({
    categoryId: category.id,
    pageSize: CATEGORY_DEALS_PAGE_SIZE,
    ...(city ? { city } : {}),
    ...(state ? { state } : {}),
  });
  return { category, deals: (data ?? []).map(trimDeal) };
}
