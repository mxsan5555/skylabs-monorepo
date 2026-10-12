import { useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from '@skylabs-monorepo/shared-utils';
import { categoryHref } from '../../../catalog/catalog-shell';
import {
  listCatalogDeals,
  listCatalogProducts,
  listCatalogTherapists,
  type CatalogCategoryWithChildren,
} from '../../../api/catalog';
import type { Coordinates } from '../../../location/geo';
import content from '../../../content.json';

const t = content.header.searchSuggestions;

export interface SearchSuggestionItem {
  id: string;
  label: string;
  sublabel?: string;
  href: string;
}

export interface SearchSuggestionGroup {
  key: 'deals' | 'products' | 'therapists' | 'categories' | 'subcategories';
  label: string;
  items: SearchSuggestionItem[];
}

export interface SearchSuggestionsResult {
  groups: SearchSuggestionGroup[];
  loading: boolean;
}

export const MIN_QUERY_LENGTH = 2;
const RESULTS_PER_GROUP = 5;
const DEBOUNCE_MS = 250;

function matchCatalogGroups(query: string, categories: CatalogCategoryWithChildren[]): SearchSuggestionGroup[] {
  const q = query.toLowerCase();
  const categoryItems: SearchSuggestionItem[] = [];
  const subcategoryItems: SearchSuggestionItem[] = [];
  for (const category of categories) {
    if (category.name.toLowerCase().includes(q)) {
      categoryItems.push({ id: category.id, label: category.name, href: categoryHref(category.slug) });
    }
    for (const sub of category.children) {
      if (sub.name.toLowerCase().includes(q)) {
        subcategoryItems.push({
          id: sub.id,
          label: sub.name,
          sublabel: category.name,
          href: categoryHref(category.slug, sub.slug),
        });
      }
    }
  }
  return [
    { key: 'categories', label: t.groups.categories, items: categoryItems.slice(0, RESULTS_PER_GROUP) },
    { key: 'subcategories', label: t.groups.subcategories, items: subcategoryItems.slice(0, RESULTS_PER_GROUP) },
  ];
}

/**
 * Live header search suggestions across Deals/Products/Therapists (existing public
 * `/catalog/*` endpoints — location-filtered the same way `search.tsx`/`category.tsx` already
 * do) plus Categories/Subcategories (matched client-side against the already-loaded catalog
 * shell tree, so no extra request). Debounced; a generation counter discards any response that
 * is no longer for the latest query, so a slow earlier keystroke can never overwrite a newer one.
 */
export function useSearchSuggestions(
  query: string,
  categories: CatalogCategoryWithChildren[],
  location: { city: string | null; state: string | null; coords: Coordinates | null },
): SearchSuggestionsResult {
  const [groups, setGroups] = useState<SearchSuggestionGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const locationRef = useRef(location);
  locationRef.current = location;

  const debouncedFetchRef = useRef(
    debounce((trimmed: string, gen: number) => {
      const { city, state, coords } = locationRef.current;
      Promise.allSettled([
        listCatalogDeals({
          search: trimmed,
          pageSize: RESULTS_PER_GROUP,
          city: city ?? undefined,
          state: state ?? undefined,
          latitude: coords?.latitude,
          longitude: coords?.longitude,
        }),
        listCatalogProducts({ search: trimmed, pageSize: RESULTS_PER_GROUP }),
        listCatalogTherapists({
          search: trimmed,
          pageSize: RESULTS_PER_GROUP,
          latitude: coords?.latitude,
          longitude: coords?.longitude,
        }),
      ]).then(([deals, products, therapists]) => {
        if (generation.current !== gen) return; // a newer query has since superseded this one
        const dealItems: SearchSuggestionItem[] =
          deals.status === 'fulfilled'
            ? (deals.value.data ?? []).map((d) => ({
                id: d.id,
                label: d.title,
                sublabel: d.category?.name ?? d.branch?.city ?? undefined,
                href: `/deal/${d.id}`,
              }))
            : [];
        const productItems: SearchSuggestionItem[] =
          products.status === 'fulfilled'
            ? (products.value.data ?? []).map((p) => ({
                id: p.id,
                label: p.name,
                sublabel: p.brand ?? p.category?.name ?? undefined,
                href: `/products/${p.id}`,
              }))
            : [];
        const therapistItems: SearchSuggestionItem[] =
          therapists.status === 'fulfilled'
            ? (therapists.value.data ?? []).map((th) => ({
                id: th.id,
                label: th.personName,
                sublabel: th.therapistType,
                href: `/therapist/${th.id}`,
              }))
            : [];
        setGroups((prev) => {
          // Categories/subcategories were already computed synchronously; keep them and merge in
          // the async groups so a fast client-side match never disappears while the API is still
          // in flight, and never gets clobbered by it landing afterwards.
          const catalogOnly = prev.filter((g) => g.key === 'categories' || g.key === 'subcategories');
          return [
            { key: 'deals', label: t.groups.deals, items: dealItems },
            { key: 'products', label: t.groups.products, items: productItems },
            { key: 'therapists', label: t.groups.therapists, items: therapistItems },
            ...catalogOnly,
          ];
        });
        setLoading(false);
      });
    }, DEBOUNCE_MS),
  );

  useEffect(() => {
    const trimmed = query.trim();
    const gen = ++generation.current;
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setGroups(matchCatalogGroups(trimmed, categories));
    setLoading(true);
    debouncedFetchRef.current(trimmed, gen);
  }, [query, categories]);

  // Memoized so the returned array is referentially stable across renders that don't actually
  // change `groups` — SiteHeader resets its keyboard highlight in a `useEffect` keyed on this
  // return value, and a fresh array identity on every render (e.g. from `setActiveOptionId`
  // itself triggering a re-render) would immediately reset that highlight right after it's set.
  const nonEmptyGroups = useMemo(() => groups.filter((g) => g.items.length > 0), [groups]);
  return { groups: nonEmptyGroups, loading };
}
