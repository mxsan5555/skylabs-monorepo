import { categoryHref, cityHref, citySlug } from '../src/catalog/catalog-shell';
import type { ShellData } from '../src/prerender-data/loaders';

/** One page to prerender. Category routes carry the slug, listing routes their kind, and city
 *  routes the city name and state the page resolves from `shell.locations`. */
export interface PrerenderRoute {
  path: string;
  slug?: string;
  listing?: 'deals' | 'products' | 'therapists';
  /** Deal page slug (`/deal/<slug>`). */
  deal?: string;
  city?: string;
  state?: string;
}

/** Public, indexable pages listed in the sitemap whether or not they are prerendered. */
export const STATIC_PUBLIC_PATHS = [
  '/',
  '/categories',
  '/deals',
  '/products',
  '/therapists',
  '/blog',
  '/about',
  '/how-it-works',
  '/contact',
  '/help-center',
  '/careers',
  '/become-member',
  '/privacy',
  '/terms',
  '/accessibility',
  '/cookies',
] as const;

/** A city page with no results is thin content: it is neither prerendered nor listed in the
 *  sitemap (the SPA still serves it if someone links to it). */
export function isEmptyCityPage(route: PrerenderRoute, data: { deals?: readonly unknown[]; items?: readonly unknown[] }): boolean {
  return !!route.city && (data.items ?? data.deals ?? []).length === 0;
}

const hasDeals = (type: string | null | undefined) => type !== 'PRODUCT' && type !== 'THERAPY';

/** `/`, every `/category/<slug>`, `/category/<slug>/<city>` for each deal category x unique city
 *  slug (first location wins, matching the category page's `locations.find`), then `/deals`,
 *  `/products`, `/therapists` and `/deals/<city>`, `/therapists/<city>` (PLANNING §4), then every
 *  visible deal's `/deal/<slug>` (PLANNING §2.7). */
export function buildRoutes(shell: ShellData, dealSlugs: readonly string[] = []): PrerenderRoute[] {
  const cities = new Map<string, { city: string; state: string }>();
  for (const { city, state } of shell.locations) {
    const key = citySlug(city);
    if (key && !cities.has(key)) cities.set(key, { city, state });
  }
  const routes: PrerenderRoute[] = [{ path: '/' }];
  for (const c of shell.categories) routes.push({ path: categoryHref(c.slug), slug: c.slug });
  for (const c of shell.categories) {
    if (!hasDeals(c.type)) continue;
    for (const { city, state } of cities.values()) routes.push({ path: cityHref(c.slug, city), slug: c.slug, city, state });
  }
  for (const listing of ['deals', 'products', 'therapists'] as const) routes.push({ path: `/${listing}`, listing });
  for (const listing of ['deals', 'therapists'] as const) {
    for (const { city, state } of cities.values()) routes.push({ path: `/${listing}/${citySlug(city)}`, listing, city, state });
  }
  for (const slug of dealSlugs) routes.push({ path: `/deal/${slug}`, deal: slug });
  return routes;
}
