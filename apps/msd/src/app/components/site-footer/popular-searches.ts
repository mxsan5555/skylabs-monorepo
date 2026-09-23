import { citySlug, cityHref } from '../../../catalog/catalog-shell';
import type { CatalogCategoryWithChildren, CatalogLocation } from '../../../api/catalog';
import content from '../../../content.json';

export interface PopularSearch {
  id: string;
  label: string;
  to: string;
}

export const POPULAR_SEARCH_LIMIT = 40;

/** "{Category} in {City}" links for every city with partners; the visitor's city first. */
export function buildPopularSearches(
  categories: CatalogCategoryWithChildren[],
  locations: CatalogLocation[],
  visitorCity: string | null,
  limit = POPULAR_SEARCH_LIMIT,
): PopularSearch[] {
  // One entry per city slug (a name can exist in two states); keep the first.
  const seen = new Set<string>();
  const unique = locations.filter((loc) => {
    const slug = citySlug(loc.city);
    if (seen.has(slug)) return false;
    seen.add(slug);
    return true;
  });
  const visitorSlug = visitorCity ? citySlug(visitorCity) : null;
  const isVisitor = (loc: CatalogLocation) => Number(citySlug(loc.city) === visitorSlug);
  const cities = unique.sort((a, b) => isVisitor(b) - isVisitor(a));
  const out: PopularSearch[] = [];
  for (const loc of cities) {
    for (const cat of categories) {
      if (out.length >= limit) return out;
      out.push({
        id: `${cat.id}|${loc.state}|${loc.city}`,
        label: content.nav.footer.popularSearchTemplate.replace('{category}', cat.name).replace('{city}', loc.city),
        to: cityHref(cat.slug, loc.city),
      });
    }
  }
  return out;
}
