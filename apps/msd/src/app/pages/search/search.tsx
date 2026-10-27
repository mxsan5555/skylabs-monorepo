import { useEffect, useState } from 'react';
import '@skylabs-monorepo/shared-ui/carousel';
import {
  getCatalogDealFacets,
  getCatalogProductFacets,
  getCatalogTherapistFacets,
  listCatalogDeals,
  listCatalogProducts,
  listCatalogTherapists,
  type CatalogDeal,
  type CatalogDealSort,
  type CatalogProduct,
  type CatalogProductSort,
  type CatalogTherapist,
  type CatalogTherapistSort,
} from '../../../api/catalog';
import { Breadcrumb } from '../../components/breadcrumb';
import { PageSection } from '../../components/page-section/page-section';
import { SectionHead } from '../../components/section-head/section-head';
import { ChipNav } from '../../components/chip-nav/chip-nav';
import { ListingBody } from '../../components/listing/listing-body';
import { dealMapPoints, listingCards, listingLoadError } from '../../components/listing/listing-cards';
import { countText, kindOfCategoryType, pickSort, sortOptionsFor, sortValuesFor, useListingParams, type ListingKind } from '../../components/listing/listing-params';
import { LISTING_FACETS, useListingFacets, type FacetFetcher } from '../../components/listing/use-listing-facets';
import type { ListingFacets } from '../../components/filter-panel/filter-panel';
import { BannerSlot } from '../../components/banner-slot/banner-slot';
import { usePagedList } from '../../../hooks/use-paged-list';
import { useVisitorLocation } from '../../../location/location-context';
import { useCatalogShell } from '../../../catalog/catalog-shell';
import { CATEGORY_PAGE_SIZE } from '../../../prerender-data/loaders';
import { Seo } from '../../seo/seo';
import content from '../../../content.json';

const t = content.search;
const ct = content.category;

type ExploreKind = ListingKind | 'all';
const KINDS: ExploreKind[] = ['all', 'deals', 'products', 'therapists'];
type ExploreItem =
  | { type: 'deals'; item: CatalogDeal }
  | { type: 'products'; item: CatalogProduct }
  | { type: 'therapists'; item: CatalogTherapist };



/** Explore's "All" facets: distance counts of deals + therapists, price across the three kinds. */
function mergeFacets(parts: (ListingFacets | null | undefined)[]): ListingFacets {
  const distance = new Map<number, number>();
  let price: ListingFacets['price'] = null;
  for (const f of parts) {
    for (const d of f?.distance ?? []) distance.set(d.km, (distance.get(d.km) ?? 0) + d.count);
    if (f?.price) price = price ? { min: Math.min(price.min, f.price.min), max: Math.max(price.max, f.price.max) } : f.price;
  }
  return { distance: [...distance].map(([km, count]) => ({ km, count })), price };
}
const allFacets = (opts: object) =>
  Promise.all([getCatalogDealFacets(opts), getCatalogProductFacets(opts), getCatalogTherapistFacets(opts)]).then((r) => ({
    data: mergeFacets(r.map((x) => x.data)),
  }));
const FACETS: Record<ExploreKind, FacetFetcher> = { all: allFacets, ...LISTING_FACETS };

/**
 * Explore / search results (`/explore?q=`, PLANNING §4): the listing layout with kind chips (All,
 * Deals, Products, Therapists; `?kind=`) carrying their counts. The filter panel and sorts follow
 * the kind; All shows location, distance and price and sorts by relevance only, since three
 * separately sorted lists cannot be merged honestly. `?category=<slug>` (treatment links) narrows
 * to that category and its kind. A search page: `noindex, follow`, canonical `/explore`.
 */
export function Search() {
  const params = useListingParams();
  const { searchParams, setParams, minPrice, maxPrice, radius, vendorIds, branchIds, tags } = params;
  const q = searchParams.get('q')?.trim() || undefined;
  const { categories } = useCatalogShell();
  const category = categories.find((c) => c.slug === searchParams.get('category'));
  const kindParam = searchParams.get('kind');
  const kind: ExploreKind = KINDS.includes(kindParam as ExploreKind)
    ? (kindParam as ExploreKind)
    : category
      ? kindOfCategoryType(category.type)
      : 'all';
  const { coords } = useVisitorLocation();
  const hasCoords = coords?.latitude != null && coords?.longitude != null;
  const sort = kind === 'all' ? undefined : pickSort(params.sortParam, sortValuesFor(kind, hasCoords));

  // Filters every kind understands, then each kind's own.
  const shared = {
    search: q,
    minPrice,
    maxPrice,
    ...(category && (kind === 'all' || kindOfCategoryType(category.type) === kind) ? { categoryId: category.id } : {}),
  };
  const near = { latitude: coords?.latitude ?? undefined, longitude: coords?.longitude ?? undefined, radiusKm: hasCoords ? radius : undefined };
  const members = kind === 'all' ? {} : { vendorIds, branchIds };
  const dealOpts = { ...shared, ...near, ...members, ...(kind === 'deals' ? { tags } : {}) };
  const productOpts = { ...shared, ...(kind === 'products' ? { tags } : {}) };
  const therapistOpts = { ...shared, ...near, ...members };
  const base = kind === 'products' ? productOpts : kind === 'therapists' ? therapistOpts : dealOpts;
  const listKey = JSON.stringify([kind, dealOpts, productOpts, therapistOpts, sort]);
  const loadError = listingLoadError(kind);

  const list = usePagedList<ExploreItem>(
    async (page) => {
      if (kind === 'deals') {
        const r = await listCatalogDeals({ ...dealOpts, page, pageSize: CATEGORY_PAGE_SIZE, sort: sort as CatalogDealSort | undefined });
        return { data: (r.data ?? []).map((item) => ({ type: 'deals' as const, item })), meta: r.meta };
      }
      if (kind === 'products') {
        const r = await listCatalogProducts({ ...productOpts, page, pageSize: CATEGORY_PAGE_SIZE, sort: sort as CatalogProductSort | undefined });
        return { data: (r.data ?? []).map((item) => ({ type: 'products' as const, item })), meta: r.meta };
      }
      if (kind === 'therapists') {
        const r = await listCatalogTherapists({ ...therapistOpts, page, pageSize: CATEGORY_PAGE_SIZE, sort: sort as CatalogTherapistSort | undefined });
        return { data: (r.data ?? []).map((item) => ({ type: 'therapists' as const, item })), meta: r.meta };
      }
      const [d, p, th] = await Promise.all([
        // "All" pages the three lists together, a full page from each, so a short list never
        // leaves the first page half empty.
        listCatalogDeals({ ...dealOpts, page, pageSize: CATEGORY_PAGE_SIZE }),
        listCatalogProducts({ ...productOpts, page, pageSize: CATEGORY_PAGE_SIZE }),
        listCatalogTherapists({ ...therapistOpts, page, pageSize: CATEGORY_PAGE_SIZE }),
      ]);
      const total = (r: { data?: unknown[] | null; meta?: { total?: number } }) => r.meta?.total ?? r.data?.length ?? 0;
      return {
        data: [
          ...(d.data ?? []).map((item) => ({ type: 'deals' as const, item })),
          ...(p.data ?? []).map((item) => ({ type: 'products' as const, item })),
          ...(th.data ?? []).map((item) => ({ type: 'therapists' as const, item })),
        ],
        meta: { total: total(d) + total(p) + total(th) },
      };
    },
    listKey,
    { errorMessage: loadError },
  );

  // Chip counts: one total per kind for the shared filters (one-row requests).
  const [totals, setTotals] = useState<Partial<Record<ListingKind, number>>>({});
  const categoryId = category?.id;
  const categoryKind = category ? kindOfCategoryType(category.type) : undefined;
  const { latitude, longitude, radiusKm } = near;
  useEffect(() => {
    let cancelled = false;
    const where = { search: q, minPrice, maxPrice, pageSize: 1 };
    const located = { latitude, longitude, radiusKm };
    const inCategory = (k: ListingKind) => (categoryId && categoryKind === k ? { categoryId } : {});
    Promise.allSettled([
      listCatalogDeals({ ...where, ...located, ...inCategory('deals') }),
      listCatalogProducts({ ...where, ...inCategory('products') }),
      listCatalogTherapists({ ...where, ...located, ...inCategory('therapists') }),
    ]).then(([d, p, th]) => {
      if (cancelled) return;
      const totalOf = (x: PromiseSettledResult<{ meta?: { total?: number } }>) => (x.status === 'fulfilled' ? x.value.meta?.total : undefined);
      setTotals({ deals: totalOf(d), products: totalOf(p), therapists: totalOf(th) });
    });
    return () => {
      cancelled = true;
    };
  }, [q, minPrice, maxPrice, latitude, longitude, radiusKm, categoryId, categoryKind]);

  const facets = useListingFacets<object>(FACETS[kind], base, kind);

  const mapPoints = dealMapPoints(list.items.flatMap((x) => (x.type === 'deals' ? [x.item] : [])));

  const chipLabel = (k: ExploreKind) => {
    const n = k === 'all' ? (['deals', 'products', 'therapists'] as const).reduce<number | undefined>((sum, x) => (sum === undefined || totals[x] === undefined ? undefined : sum + (totals[x] ?? 0)), 0) : totals[k];
    return n === undefined ? t.kinds[k] : t.kindChip.replace('{label}', t.kinds[k]).replace('{count}', String(n));
  };
  const heading = q ? t.resultsFor.replace('{q}', q) : t.heading;
  const cards = list.items.flatMap((x) =>
    x.type === 'deals'
      ? listingCards({ kind: 'deals', items: [x.item] }, params.view)
      : x.type === 'products'
        ? listingCards({ kind: 'products', items: [x.item] }, params.view)
        : listingCards({ kind: 'therapists', items: [x.item] }, params.view),
  );

  return (
    <>
      <Seo title={`${heading}${ct.metaTitleSuffix}`} description={t.description} path="/explore" noindex="follow" />
      <PageSection stack aria-labelledby="explore-heading">
        <Breadcrumb items={[{ label: t.breadcrumb.home, to: '/' }, { label: t.breadcrumb.explore }]} />
        <SectionHead as="h1" id="explore-heading" titleClassName="headline-large" heading={heading} subheading={t.description} />
        <ChipNav
          ariaLabel={t.kindsLabel}
          items={KINDS.map((k) => ({ value: k, label: chipLabel(k) }))}
          value={kind}
          onSelect={(value) => setParams({ kind: value === 'all' ? undefined : value, sort: undefined, tag: undefined, vendor: undefined, branch: undefined })}
          end={
            <span className="body-medium" aria-live="polite" aria-atomic="true">
              {countText(list.status, list.total, t.resultCount)}
            </span>
          }
        />
      </PageSection>
      <BannerSlot slot="EXPLORE_TOP" />
      <ListingBody
        kind={kind}
        ariaLabel={t.resultsAriaLabel}
        params={params}
        facets={facets}
        sortOptions={kind === 'all' ? sortOptionsFor('deals', false, ct.sortOptions).slice(0, 1) : sortOptionsFor(kind, hasCoords, ct.sortOptions)}
        sort={sort}
        list={list}
        cards={cards}
        mapPoints={mapPoints}
      />
    </>
  );
}

export default Search;
