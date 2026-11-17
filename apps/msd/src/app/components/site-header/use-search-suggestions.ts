import { useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from '@skylabs-monorepo/shared-utils';
import { categoryHref, dealHref } from '../../../catalog/catalog-shell';
import {
  listCatalogDeals,
  listCatalogProducts,
  listCatalogTherapists,
  type CatalogCategoryWithChildren,
  type CatalogDeal,
  type CatalogProduct,
  type CatalogTherapist,
} from '../../../api/catalog';
import type { Coordinates } from '../../../location/geo';
import { fillTemplate, formatINR } from '../../../utils/format';
import { resolveTherapistMedia } from '../../../utils/media';
import { productPath, therapistPath } from '../../seo/public-urls';
import { toDealCardDeal, toProductCardDeal } from '../../pages/home/home-data';
import {
  formatDistance,
  lowestPackagePrice,
} from '../therapist-card/therapist-card';
import content from '../../../content.json';

const t = content.header.searchSuggestions;

/** One result row. Text rows (categories) use `label`/`sublabel` only; rich rows (services,
 *  therapists, products) add the image, place, distance and price, all already formatted. */
export interface SearchSuggestionItem {
  id: string;
  label: string;
  /** Text rows: the parent category. Rich rows: the member or brand. */
  sublabel?: string;
  href: string;
  image?: string;
  imageAlt?: string;
  place?: string;
  distance?: string;
  price?: string;
  originalPrice?: string;
  discount?: string;
}

export type SearchSuggestionGroupKey =
  | 'browse'
  | 'categories'
  | 'deals'
  | 'therapists'
  | 'products';

export interface SearchSuggestionGroup {
  key: SearchSuggestionGroupKey;
  label: string;
  /** Explains the rows, e.g. that the visitor's city has no deals and these are from elsewhere. */
  note?: string;
  /** Rich rows with media and price (deals, therapists, products). */
  rich: boolean;
  items: SearchSuggestionItem[];
}

export interface SearchSuggestionsResult {
  groups: SearchSuggestionGroup[];
  loading: boolean;
  /** Sum of the API totals for services, therapists and products; null until known. */
  total: number | null;
}

export interface SearchLocation {
  city: string | null;
  state: string | null;
  coords: Coordinates | null;
}

export const MIN_QUERY_LENGTH = 2;
const RESULTS_PER_GROUP = 4;
const TEXT_RESULTS = 5;
const DEBOUNCE_MS = 250;

const discountLabel = (percent?: number) =>
  percent
    ? fillTemplate(content.offerCard.discount, { percent: String(percent) })
    : undefined;

function dealItem(deal: CatalogDeal): SearchSuggestionItem {
  const card = toDealCardDeal(deal);
  return {
    id: deal.id,
    label: card.title,
    sublabel: card.providerName,
    href: dealHref(deal),
    image: card.image || undefined,
    imageAlt: '',
    place: deal.branch?.address ?? card.location,
    distance: card.distance != null ? formatDistance(card.distance) : undefined,
    price: formatINR(card.price),
    originalPrice: card.originalPrice
      ? formatINR(card.originalPrice)
      : undefined,
    discount: discountLabel(card.discount),
  };
}

function therapistItem(therapist: CatalogTherapist): SearchSuggestionItem {
  const price = lowestPackagePrice(therapist.packages);
  return {
    id: therapist.id,
    label: therapist.personName,
    sublabel: [therapist.therapistType, therapist.vendor?.businessName]
      .filter(Boolean)
      .join(' · '),
    href: therapistPath(therapist),
    image: resolveTherapistMedia(therapist).images[0],
    imageAlt: '',
    place: therapist.branch?.address ?? therapist.branch?.city ?? undefined,
    distance:
      therapist.distanceKm != null
        ? formatDistance(therapist.distanceKm)
        : undefined,
    price:
      price != null
        ? fillTemplate(t.from, { price: formatINR(price) })
        : undefined,
  };
}

function productItem(product: CatalogProduct): SearchSuggestionItem {
  const card = toProductCardDeal(product);
  return {
    id: product.id,
    label: card.title,
    sublabel: product.brand ?? card.providerName,
    href: productPath(product),
    image: card.image || undefined,
    imageAlt: '',
    price: formatINR(card.price),
    originalPrice: card.originalPrice
      ? formatINR(card.originalPrice)
      : undefined,
    discount: discountLabel(card.discount),
  };
}

/** Top-level categories, shown before the visitor types anything. */
function browseGroup(
  categories: CatalogCategoryWithChildren[],
): SearchSuggestionGroup[] {
  const items = categories
    .slice(0, TEXT_RESULTS + 1)
    .map((c) => ({ id: c.id, label: c.name, href: categoryHref(c.slug) }));
  return [{ key: 'browse', label: t.groups.browse, rich: false, items }];
}

/** Categories and subcategories whose name contains the query, matched client-side against the
 *  already-loaded catalog shell tree (no request). */
function categoryGroup(
  query: string,
  categories: CatalogCategoryWithChildren[],
): SearchSuggestionGroup[] {
  const q = query.toLowerCase();
  const items: SearchSuggestionItem[] = [];
  for (const category of categories) {
    if (category.name.toLowerCase().includes(q)) {
      items.push({
        id: category.id,
        label: category.name,
        href: categoryHref(category.slug),
      });
    }
    for (const sub of category.children) {
      if (sub.name.toLowerCase().includes(q)) {
        items.push({
          id: sub.id,
          label: sub.name,
          sublabel: category.name,
          href: categoryHref(category.slug, sub.slug),
        });
      }
    }
  }
  return [
    {
      key: 'categories',
      label: t.groups.categories,
      rich: false,
      items: items.slice(0, TEXT_RESULTS),
    },
  ];
}

/**
 * Header search results: Deals, Therapists and Products from the public `/catalog/*` endpoints,
 * nearest first for the visitor's location (deals also take the city and state), plus categories
 * matched client-side. When the visitor's city has no matching deal, the deals are fetched again
 * without the city (nearest first when there are coordinates) under a note saying so, and "Show
 * all" then carries no count. Below `MIN_QUERY_LENGTH` it returns the top
 * categories without any request. A change of query or location re-runs the search; the fetch is
 * debounced and a generation counter drops any response that is no longer for the latest input.
 */
export function useSearchSuggestions(
  query: string,
  categories: CatalogCategoryWithChildren[],
  location: SearchLocation,
): SearchSuggestionsResult {
  const [groups, setGroups] = useState<SearchSuggestionGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const generation = useRef(0);
  const locationRef = useRef(location);
  locationRef.current = location;
  const { city, state, coords } = location;
  const locationKey = `${city}|${state}|${coords?.latitude},${coords?.longitude}`;

  const debouncedFetchRef = useRef(
    debounce((trimmed: string, gen: number) => {
      const { city, state, coords } = locationRef.current;
      const near = { latitude: coords?.latitude, longitude: coords?.longitude };
      const dealsNearby = async () => {
        const base = { search: trimmed, pageSize: RESULTS_PER_GROUP, ...near };
        const local = await listCatalogDeals({
          ...base,
          city: city ?? undefined,
          state: state ?? undefined,
        });
        if (!city || (local.data ?? []).length > 0)
          return { ...local, elsewhere: false };
        const wider = await listCatalogDeals(base);
        return {
          data: wider.data,
          meta: undefined,
          elsewhere: (wider.data ?? []).length > 0,
        };
      };
      Promise.allSettled([
        dealsNearby(),
        listCatalogTherapists({
          search: trimmed,
          pageSize: RESULTS_PER_GROUP,
          ...near,
        }),
        listCatalogProducts({ search: trimmed, pageSize: RESULTS_PER_GROUP }),
      ]).then(([deals, therapists, products]) => {
        if (generation.current !== gen) return; // a newer query or location superseded this one
        const settled = [deals, therapists, products];
        const totals = settled.map((r) =>
          r.status === 'fulfilled' ? r.value.meta?.total : undefined,
        );
        const known = totals.filter((n): n is number => typeof n === 'number');
        const rows = <T>(
          r: PromiseSettledResult<{ data: T[] }>,
          map: (v: T) => SearchSuggestionItem,
        ) => (r.status === 'fulfilled' ? (r.value.data ?? []).map(map) : []);
        const elsewhere =
          deals.status === 'fulfilled' && deals.value.elsewhere && city;
        setGroups((prev) => [
          // The synchronous category match stays; the async groups follow it.
          ...prev.filter((g) => g.key === 'categories'),
          {
            key: 'deals',
            label: t.groups.deals,
            ...(elsewhere
              ? {
                  note: fillTemplate(t.dealsElsewhere, { city }),
                }
              : {}),
            rich: true,
            items: rows(deals, dealItem),
          },
          {
            key: 'therapists',
            label: t.groups.therapists,
            rich: true,
            items: rows(therapists, therapistItem),
          },
          {
            key: 'products',
            label: t.groups.products,
            rich: true,
            items: rows(products, productItem),
          },
        ]);
        // Deals from other cities are not in /explore's count for this city, so no number then.
        setTotal(
          !elsewhere && known.length > 0
            ? known.reduce((a, b) => a + b, 0)
            : null,
        );
        setLoading(false);
      });
    }, DEBOUNCE_MS),
  );

  useEffect(() => {
    const trimmed = query.trim();
    const gen = ++generation.current;
    setTotal(null);
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setGroups(browseGroup(categories));
      setLoading(false);
      return;
    }
    setGroups(categoryGroup(trimmed, categories));
    setLoading(true);
    debouncedFetchRef.current(trimmed, gen);
  }, [query, categories, locationKey]);

  // Stable identity unless `groups` changed: SiteHeader resets its keyboard highlight on change.
  const nonEmptyGroups = useMemo(
    () => groups.filter((g) => g.items.length > 0),
    [groups],
  );
  return { groups: nonEmptyGroups, loading, total };
}
