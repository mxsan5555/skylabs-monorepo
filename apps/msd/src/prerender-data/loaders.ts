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
  return { deals: valueOr(deals), products: valueOr(products), therapists: valueOr(therapists), faqs: valueOr(faqs) };
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
  return { category, deals: data ?? [] };
}
