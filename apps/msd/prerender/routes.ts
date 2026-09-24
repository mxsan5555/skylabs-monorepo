import { categoryHref, cityHref, citySlug } from '../src/catalog/catalog-shell';
import type { ShellData } from '../src/prerender-data/loaders';

/** One page to prerender. Category routes carry the slug, and city routes the city name and
 *  state the category page resolves from `shell.locations`. */
export interface PrerenderRoute {
  path: string;
  slug?: string;
  city?: string;
  state?: string;
}

/** Public, indexable pages listed in the sitemap whether or not they are prerendered. */
export const STATIC_PUBLIC_PATHS = [
  '/',
  '/explore',
  '/categories',
  '/products',
  '/therapists',
  '/blog',
  '/about',
  '/how-it-works',
  '/contact',
  '/careers',
  '/become-vendor',
  '/privacy',
  '/terms',
  '/accessibility',
  '/cookies',
] as const;

const hasDeals = (type: string | null | undefined) => type !== 'PRODUCT' && type !== 'THERAPY';

/** `/`, every `/category/<slug>`, and `/category/<slug>/<city>` for each deal category x unique
 *  city slug (first location wins, matching the category page's `locations.find`). */
export function buildRoutes(shell: ShellData): PrerenderRoute[] {
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
  return routes;
}
