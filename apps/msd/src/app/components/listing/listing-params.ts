import { useSearchParams } from 'react-router-dom';
import { CATALOG_OFFER_TAGS, type CatalogOfferTag } from '../../../api/catalog';

/** Distance filter options (km); must match the API's facet buckets. */
export const RADIUS_KM = [1, 5, 10, 20, 50, 100];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A non-negative number from a query param, or undefined. */
export function toPrice(value: string | null): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** A radius from the URL, only when it is one of the offered distances. */
export function toRadius(value: string | null): number | undefined {
  const n = toPrice(value);
  return n != null && RADIUS_KM.includes(n) ? n : undefined;
}

/** UUID-looking ids from a comma-joined query param (`?vendor=id,id`), invalid entries dropped. */
export function toIds(value: string | null): string[] {
  if (!value) return [];
  return value.split(',').filter((v) => UUID_RE.test(v));
}

/** Known card tags from `?tag=new,hot`, unknown entries dropped. */
export function toTags(value: string | null): CatalogOfferTag[] {
  if (!value) return [];
  return value.split(',').filter((v): v is CatalogOfferTag => (CATALOG_OFFER_TAGS as string[]).includes(v));
}

export type ListingView = 'grid' | 'list' | 'map';

/** The filter params a listing's "Clear all" empties. */
export const FILTER_PARAMS = ['radius', 'min', 'max', 'vendor', 'branch', 'tag', 'cat'] as const;

/**
 * Listing view state from the URL (PLANNING §4: all view state is in the URL): `sort`, `view`,
 * `min`, `max`, `radius`, `vendor`, `branch`, `tag`, `cat`. Writes replace the history entry.
 */
export function useListingParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const setParams = (patch: Record<string, string | undefined>) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  const viewParam = searchParams.get('view');
  return {
    searchParams,
    setParams,
    sortParam: searchParams.get('sort'),
    view: (viewParam === 'list' || viewParam === 'map' ? viewParam : 'grid') as ListingView,
    minPrice: toPrice(searchParams.get('min')),
    maxPrice: toPrice(searchParams.get('max')),
    radius: toRadius(searchParams.get('radius')),
    vendorIds: toIds(searchParams.get('vendor')),
    branchIds: toIds(searchParams.get('branch')),
    tags: toTags(searchParams.get('tag')),
    categoryIds: toIds(searchParams.get('cat')),
  };
}

export type ListingParams = ReturnType<typeof useListingParams>;

/** A sort from the URL when it is one of `allowed` and not the default `relevance`. */
export function pickSort<S extends string>(param: string | null, allowed: readonly S[]): S | undefined {
  return param && param !== 'relevance' && (allowed as readonly string[]).includes(param) ? (param as S) : undefined;
}

/** "{n} deals" / "1 deal"; empty while the list loads. */
export function countText(status: string, total: number, noun: { singular: string; plural: string }): string {
  return status === 'loading' ? '' : `${total} ${total === 1 ? noun.singular : noun.plural}`;
}

export type ListingKind = 'deals' | 'products' | 'therapists';

/** Sorts per kind (PLANNING §4 filter table); Distance only with the visitor's coordinates. */
const SORTS: Record<ListingKind, string[]> = {
  deals: ['relevance', 'price_asc', 'price_desc', 'distance'],
  products: ['relevance', 'newest', 'price_asc', 'price_desc', 'discount'],
  therapists: ['relevance', 'price_asc', 'price_desc', 'distance'],
};

/** The sort values a kind offers right now. */
export function sortValuesFor(kind: ListingKind, hasCoords: boolean): string[] {
  return SORTS[kind].filter((v) => v !== 'distance' || hasCoords);
}

/** Sort menu options (label from `content.category.sortOptions`) for a kind. */
export function sortOptionsFor(kind: ListingKind, hasCoords: boolean, labels: { value: string; label: string }[]) {
  const values = sortValuesFor(kind, hasCoords);
  return labels.filter((o) => values.includes(o.value)).sort((a, b) => values.indexOf(a.value) - values.indexOf(b.value));
}
