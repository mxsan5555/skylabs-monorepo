import { cityHref } from '../../../catalog/catalog-shell';
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
  const cities = [...locations].sort((a, b) => Number(b.city === visitorCity) - Number(a.city === visitorCity));
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
