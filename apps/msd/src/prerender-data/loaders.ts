import {
  getCatalogCategory,
  getCatalogDeal,
  listCatalogCategories,
  listCatalogDeals,
  listCatalogFaqs,
  listCatalogLocations,
  listCatalogPopularTreatments,
  listCatalogProducts,
  listCatalogSocialLinks,
  listCatalogTherapists,
  type CatalogCategoryWithChildren,
  type CatalogDeal,
  type CatalogDealDetail,
  type CatalogFaq,
  type CatalogLocation,
  type CatalogPopularTreatmentGroup,
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
  popularTreatments: CatalogPopularTreatmentGroup[];
}

/** Payload for key `categoryDataKey(slug, city)` (read by the category page). `category: null`
 *  means the slug does not exist; `deals` is empty for PRODUCT/THERAPY categories. `total` = all
 *  matching deals (API `meta.total`), `deals` = the first page. */
export interface CategoryData {
  category: CatalogCategoryWithChildren | null;
  deals: CatalogDeal[];
  total: number;
}

/** Cards per page on the category page (and its prerendered first page). */
export const CATEGORY_PAGE_SIZE = 12;

/** Payload for key `listingDataKey(kind, city)` (read by `ListingPage`): the default view's
 *  first page and the API total. */
export interface ListingData<T = CatalogDeal | CatalogProduct | CatalogTherapist> {
  items: T[];
  total: number;
}

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
    ...pick(d, ['id', 'title', 'originalPrice', 'salePrice', 'discountPercent', 'durationMinutes', 'images', 'vendor', 'packages', 'popularTags', 'distanceKm', 'tag']),
    // The home "Deals near you" tabs group deals by category id.
    ...(d.category !== undefined ? { category: d.category && pick(d.category, ['id', 'name', 'slug']) } : {}),
    ...(d.branch !== undefined ? { branch: trimBranch(d.branch) } : {}),
    ...trimMedia(d),
  }) as CatalogDeal;

export const trimProduct = (p: CatalogProduct): CatalogProduct =>
  pick(p, ['id', 'name', 'image', 'imageAlt', 'price', 'originalPrice', 'discount', 'vendor', 'popularTags', 'tag']) as CatalogProduct;

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
  const [deals, products, therapists, faqs, popularTreatments] = await Promise.allSettled([
    listCatalogDeals({ pageSize: HOME_DEALS_PAGE_SIZE }),
    listCatalogProducts({ pageSize: HOME_RAIL_SIZE, sort: 'newest' }),
    listCatalogTherapists({ pageSize: HOME_RAIL_SIZE }),
    listCatalogFaqs(),
    listCatalogPopularTreatments(),
  ]);
  for (const r of [deals, products, therapists]) if (r.status === 'rejected') throw r.reason;
  return {
    deals: valueOr(deals).map(trimDeal),
    products: valueOr(products).map(trimProduct),
    therapists: valueOr(therapists).map(trimTherapist),
    faqs: valueOr(faqs),
    popularTreatments: valueOr(popularTreatments),
  };
}

/** Every currently-visible Deal/Product/Therapist slug, for the sitemap — reuses the same
 *  public catalog endpoints the storefront itself calls, so a suspended/inactive vendor's items
 *  (already excluded by `VISIBLE_DEAL_WHERE`/`VISIBLE_PRODUCT_WHERE`/`VISIBLE_THERAPIST_WHERE`
 *  server-side) are never listed here either — no separate "is this public" check needed.
 *  Capped at `SITEMAP_PAGE_SIZE` per catalog (a single page) — fine at this catalog's current
 *  scale; a catalog that outgrows one page needs this to paginate, flagged here rather than
 *  silently truncated forever. A failing list yields [] for that catalog, same "non-critical"
 *  tolerance as `loadShellData`. */
const SITEMAP_PAGE_SIZE = 500;
export async function loadSitemapSlugs(): Promise<{ deals: string[]; products: string[]; therapists: string[] }> {
  const [deals, products, therapists] = await Promise.allSettled([
    listCatalogDeals({ pageSize: SITEMAP_PAGE_SIZE }),
    listCatalogProducts({ pageSize: SITEMAP_PAGE_SIZE }),
    listCatalogTherapists({ pageSize: SITEMAP_PAGE_SIZE }),
  ]);
  const slugsOf = (r: typeof deals | typeof products | typeof therapists) =>
    valueOr(r as PromiseSettledResult<{ data: { id: string; slug?: string | null }[] | null | undefined }>).map((row) => row.slug || row.id);
  return { deals: slugsOf(deals), products: slugsOf(products), therapists: slugsOf(therapists) };
}

/** A category and its unfiltered ("All" tab) deals, optionally for one city. A 404 slug returns
 *  `{ category: null, deals: [] }`; any other failure rejects. */
export async function loadCategoryData(slug: string, city?: string, state?: string): Promise<CategoryData> {
  let category: CatalogCategoryWithChildren | null;
  try {
    category = (await getCatalogCategory(slug)).data ?? null;
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) return { category: null, deals: [], total: 0 };
    throw err;
  }
  if (!category || category.type === 'PRODUCT' || category.type === 'THERAPY') return { category, deals: [], total: 0 };
  const { data, meta } = await listCatalogDeals({
    categoryId: category.id,
    pageSize: CATEGORY_PAGE_SIZE,
    ...(city ? { city } : {}),
    ...(state ? { state } : {}),
  });
  return { category, deals: (data ?? []).map(trimDeal), total: meta?.total ?? (data ?? []).length };
}

/** The first page of `/deals`, `/products` or `/therapists` (optionally one city) in its default
 *  view. Rejects when the list call fails. */
export async function loadListingData(kind: 'deals' | 'products' | 'therapists', city?: string, state?: string): Promise<ListingData> {
  const where = { pageSize: CATEGORY_PAGE_SIZE, ...(city ? { city } : {}), ...(state ? { state } : {}) };
  if (kind === 'products') {
    const { data, meta } = await listCatalogProducts({ pageSize: CATEGORY_PAGE_SIZE });
    return { items: (data ?? []).map(trimProduct), total: meta?.total ?? (data ?? []).length };
  }
  if (kind === 'therapists') {
    const { data, meta } = await listCatalogTherapists(where);
    return { items: (data ?? []).map(trimTherapist), total: meta?.total ?? (data ?? []).length };
  }
  const { data, meta } = await listCatalogDeals(where);
  return { items: (data ?? []).map(trimDeal), total: meta?.total ?? (data ?? []).length };
}

/** Payload for key `dealDataKey(slug)` (read by the deal page). `deal: null` means not found. */
export interface DealData {
  deal: CatalogDealDetail | null;
}

/** Most deal pages one build prerenders (100 per API page). */
export const DEAL_PRERENDER_LIMIT = 2000;

/** Slugs of every visible deal, for `/deal/<slug>` pages and the sitemap (PLANNING §2.7). */
export async function loadDealSlugs(limit = DEAL_PRERENDER_LIMIT): Promise<string[]> {
  const slugs: string[] = [];
  for (let page = 1; slugs.length < limit; page += 1) {
    const { data, meta } = await listCatalogDeals({ page, pageSize: 100 });
    const rows = data ?? [];
    slugs.push(...rows.map((d) => d.slug).filter(Boolean));
    if (rows.length < 100 || slugs.length >= (meta?.total ?? 0)) break;
  }
  return [...new Set(slugs)].slice(0, limit);
}

/** One deal page's data; a 404 is `{ deal: null }`, other errors reject. */
export async function loadDealData(slug: string): Promise<DealData> {
  try {
    const { data } = await getCatalogDeal(slug);
    return { deal: data };
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) return { deal: null };
    throw err;
  }
}
