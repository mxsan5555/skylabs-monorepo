import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useState, useMemo, createElement } from 'react';
import { FilledButton } from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui/carousel';
import { OfferCard, popularTag } from '../../components/offer-card/offer-card';
import { getCatalogCategory, getCatalogDealFacets, listCatalogDeals, listCatalogProducts, listCatalogTherapists, type CatalogCategoryWithChildren, type CatalogDeal, type CatalogDealFacets, type CatalogDealSort, type CatalogProduct, type CatalogTherapist, } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { TherapistCard, lowestPackagePrice } from '../../components/therapist-card/therapist-card';
import { useMediaQuery } from '../../../hooks/use-media-query';
import { Breadcrumb } from '../../components/breadcrumb';
import { TherapistAddToCartDialog } from '../../components/therapist-add-to-cart-dialog';
import { CardGrid } from '../../components/card-grid/card-grid';
import { PageSection } from '../../components/page-section/page-section';
import { SectionHead } from '../../components/section-head/section-head';
import { PageHeadLogo } from '../../components/section-head/page-head-logo';
import { ChipNav } from '../../components/chip-nav/chip-nav';
import { ClampText } from '../../components/clamp-text/clamp-text';
import { ListingToolbar } from '../../components/listing-toolbar/listing-toolbar';
import { ChoiceMenu } from '../../components/choice-menu/choice-menu';
import { ViewSwitch, type ViewOption } from '../../components/view-switch/view-switch';
import { LoadMore } from '../../components/load-more/load-more';
import { SidebarLayout } from '../../components/sidebar-layout/sidebar-layout';
import { FilterPanel } from '../../components/filter-panel/filter-panel';
import { CityPickerDialog } from '../../components/city-picker-dialog/city-picker-dialog';
import type { PriceRange } from '../../components/price-range-field/price-range-field';
import { DealMap, type DealMapPoint } from '../../components/deal-map/deal-map';
import { usePagedList } from '../../../hooks/use-paged-list';
import { formatINR } from '../../../utils/format';
import { useVisitorLocation } from '../../../location/location-context';
import { citySlug, cityHref, categoryHref, useCatalogShell } from '../../../catalog/catalog-shell';
import { categoryDataKey, usePrerenderedData } from '../../../prerender-data/prerender-data';
import { CATEGORY_PAGE_SIZE, type CategoryData } from '../../../prerender-data/loaders';
import { Seo } from '../../seo/seo';
import { breadcrumbJsonLd } from '../../seo/jsonld';
import { SITE_URL } from '../../seo/site-url';
import content from '../../../content.json';
import { BannerSlot } from '../../components/banner-slot/banner-slot';
const t = content.category;

/** msd-api's deal sort enum, minus `newest`/`discount` (superseded by price/distance sorts on
 *  this page; those two values are kept server-side only for other, unmigrated callers). */
const SORTS = ['relevance', 'price_asc', 'price_desc', 'distance'] as const;
/** SERVICE (or untyped, legacy) categories list deals; PRODUCT/THERAPY list their own entities. */
function isDealCategory(category: CatalogCategoryWithChildren): boolean {
  return category.type !== 'PRODUCT' && category.type !== 'THERAPY';
}
/** A non-negative number from a query param, or undefined. */
function toPrice(value: string | null): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
/** Distance filter options (km); must match the API's facet buckets. */
const RADIUS_KM = [1, 5, 10, 20, 50, 100];
/** A radius from the URL, only when it is one of the offered distances. */
function toRadius(value: string | null): number | undefined {
  const n = toPrice(value);
  return n != null && RADIUS_KM.includes(n) ? n : undefined;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** UUID-looking ids from a comma-joined query param (`?vendor=id,id`), invalid entries dropped. */
function toIds(value: string | null): string[] {
  if (!value) return [];
  return value.split(',').filter((v) => UUID_RE.test(v));
}
/**
 * Category → Sub Category → (Deal | Product | Therapist) discovery page — the customer
 * catalogue's single canonical entry point. Composes PageSection, SectionHead and CardGrid with
 * the existing `DealCard` components unchanged, but reads real Vendor/Branch/Deal/Therapist data from
 * `GET /catalog/*` — only active, approved records with an active vendor/branch are ever
 * returned (enforced server-side in `catalog.service.ts`).
 *
 * `category.type` (`SERVICE | PRODUCT | THERAPY`) automatically determines what this page lists
 * — never a manual toggle: a SERVICE (or untyped, legacy) category shows Deal cards (`GET
 * /catalog/deals`), a PRODUCT category shows Product cards (`GET /catalog/products` — Product is
 * a fully independent catalog entity now, never a Deal), and a THERAPY category shows Therapist
 * cards (`GET /catalog/therapists`, filtered by `categoryId`/`subcategoryId`). "All" (the
 * default) shows every record in the category; selecting a subcategory pill narrows to that
 * subcategory only.
 */
export function Category() {
  const { slug = '', city: citySlugParam } = useParams<{ slug: string; city?: string }>();
  const navigate = useNavigate();
  const { coords, city: visitorCity } = useVisitorLocation();
  const { locationsStatus, locations } = useCatalogShell();
  const cityLocation = citySlugParam ? locations.find((l) => citySlug(l.city) === citySlugParam) : undefined;
  const initial = usePrerenderedData<CategoryData>(categoryDataKey(slug, cityLocation?.city));
  const initialHasDeals = !!initial?.category && isDealCategory(initial.category);
  const [category, setCategory] = useState<CatalogCategoryWithChildren | null>(initial?.category ?? null);
  const [categoryLoading, setCategoryLoading] = useState(!initial);
  const [categoryError, setCategoryError] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const cityUnresolved = !!citySlugParam && !cityLocation;
  const cityPending = cityUnresolved && locationsStatus === 'loading';
  const cityMissing = cityUnresolved && locationsStatus === 'ready';
  useEffect(() => {
    let cancelled = false;
    const notFound = (err: unknown) => err instanceof ApiRequestError && err.status === 404;
    // `initial` is keyed by this slug (and city) and stable per key. Prerendered, the page shows it
    // at once (a null category is a prerendered 404), then refreshes quietly and swaps only if the
    // API changed it.
    if (initial) {
      const seed = initial.category;
      setCategory(seed);
      setCategoryLoading(false);
      getCatalogCategory(slug)
        .then(({ data }) => {
          if (!cancelled && JSON.stringify(data) !== JSON.stringify(seed)) setCategory(data);
        })
        .catch((err) => {
          if (!cancelled && notFound(err)) setCategory(null);
        });
      return () => { cancelled = true; };
    }
    setCategoryLoading(true);
    setCategoryError('');
    getCatalogCategory(slug)
      .then(({ data }) => { if (!cancelled) setCategory(data); })
      .catch((err) => {
        if (cancelled) return;
        if (notFound(err)) setCategory(null);
        else setCategoryError(err instanceof ApiRequestError ? err.message : content.category.errors.loadCategory);
      })
      .finally(() => { if (!cancelled) setCategoryLoading(false); });
    return () => { cancelled = true; };
  }, [slug, initial]);
  const subSlug = searchParams.get('sub');
  const subcategoryIdx = (category?.children.findIndex((c) => c.slug === subSlug) ?? -1) + 1;
  const activeSubcategory = subcategoryIdx === 0 ? undefined : category?.children[subcategoryIdx - 1];
  const hasCoords = coords?.latitude != null && coords?.longitude != null;
  const sortParam = searchParams.get('sort');
  const sort =
    (SORTS as readonly string[]).includes(sortParam ?? '') && sortParam !== 'relevance' && (sortParam !== 'distance' || hasCoords)
      ? (sortParam as CatalogDealSort)
      : undefined;
  const sortOption = t.sortOptions.find((o) => o.value === (sort ?? 'relevance')) ?? t.sortOptions[0];
  const sortMenuOptions = t.sortOptions.filter((o) => o.value !== 'distance' || hasCoords);
  const viewParam = searchParams.get('view');
  const view = viewParam === 'list' || viewParam === 'map' ? viewParam : 'grid';
  const minPrice = toPrice(searchParams.get('min'));
  const maxPrice = toPrice(searchParams.get('max'));
  const radius = toRadius(searchParams.get('radius'));
  const vendorIds = toIds(searchParams.get('vendor'));
  const branchIds = toIds(searchParams.get('branch'));
  const dealFilters = category?.type !== 'PRODUCT';
  const activeFilters = [
    dealFilters && hasCoords && radius != null,
    minPrice != null || maxPrice != null,
    dealFilters && vendorIds.length > 0,
    dealFilters && branchIds.length > 0,
  ].filter(Boolean).length;
  const setParam = (key: string, value: string | undefined) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      }, { replace: true },
    );
  };
  const setListParams = (patch: Record<string, string | undefined>) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value);
          else next.delete(key);
        } return next;
      }, { replace: true },
    );
  };
  const isTherapyCategory = category?.type === 'THERAPY';
  const isProductCategory = category?.type === 'PRODUCT';
  const lat = coords?.latitude ?? undefined;
  const lng = coords?.longitude ?? undefined;
  const common = {
    categoryId: category?.id,
    subcategoryId: activeSubcategory?.id,
    pageSize: CATEGORY_PAGE_SIZE,
  };
  const listKey = JSON.stringify([
    category?.id,
    activeSubcategory?.id,
    sort,
    minPrice,
    maxPrice,
    cityLocation?.city,
    lat,
    lng,
    radius,
    vendorIds.join(),
    branchIds.join(),
  ]);
  const therapistListKey = JSON.stringify([
    category?.id,
    activeSubcategory?.id,
    lat,
    lng,
  ]);
  const isDefaultView =
    !activeSubcategory &&
    !sort &&
    minPrice == null &&
    maxPrice == null &&
    lat == null &&
    lng == null &&
    radius == null &&
    vendorIds.length === 0 &&
    branchIds.length === 0;
  const loadError = (err: unknown) => (err instanceof ApiRequestError ? err.message : t.errors.loadDeals);
  const dealList = usePagedList<CatalogDeal>(
    (page) =>
      listCatalogDeals({
        ...common,
        page,
        city: cityLocation?.city,
        state: cityLocation?.state,
        sort,
        minPrice,
        maxPrice,
        latitude: lat,
        longitude: lng,
        vendorIds,
        branchIds,
        radiusKm: hasCoords ? radius : undefined,
      }),
    listKey,
    {
      enabled: !!category && isDealCategory(category) && !cityPending && !cityMissing,
      errorMessage: loadError,
      initial:
        initialHasDeals && isDefaultView ? { items: initial.deals, total: initial.total ?? initial.deals.length } : undefined,
    },
  );
  const productList = usePagedList<CatalogProduct>(
    (page) => listCatalogProducts({ ...common, page, sort: sort !== 'distance' ? sort : undefined, minPrice, maxPrice }),
    listKey,
    { enabled: category?.type === 'PRODUCT', errorMessage: loadError, },
  );
  const therapistList = usePagedList<CatalogTherapist>(
    (page) =>
      listCatalogTherapists({ ...common, page, latitude: lat, longitude: lng, }),
    therapistListKey,
    { enabled: category?.type === 'THERAPY', errorMessage: loadError, },
  );
  const list = isTherapyCategory ? therapistList : isProductCategory ? productList : dealList;
  const deals = dealList.items;
  const products = productList.items;
  const sortedTherapists = useMemo(() => {
    const items = [...therapistList.items];
    if (!sort || sort === 'relevance') {
      return items;
    }
    const getDistance = (therapist: CatalogTherapist) =>
      therapist.distanceKm != null ? Number(therapist.distanceKm) : null;
    const compareNullable = (
      a: number | null,
      b: number | null,
      direction: 1 | -1,
    ) => {
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return (a - b) * direction;
    };
    return items
      .map((therapist, index) => ({ therapist, index }))
      .sort((a, b) => {
        let result = 0;
        if (sort === 'price_asc' || sort === 'price_desc') {
          result = compareNullable(
            lowestPackagePrice(a.therapist.packages),
            lowestPackagePrice(b.therapist.packages),
            sort === 'price_asc' ? 1 : -1,
          );
        } else if (sort === 'distance') {
          result = compareNullable(
            getDistance(a.therapist),
            getDistance(b.therapist),
            1,
          );
        }
        return result || a.index - b.index;
      })
      .map(({ therapist }) => therapist);
  }, [therapistList.items, sort]);
  const mapPoints = useMemo<DealMapPoint[]>(
    () =>
      deals.flatMap((d) =>
        d.branch?.latitude != null && d.branch?.longitude != null
          ? [{ id: d.id, lat: Number(d.branch.latitude), lng: Number(d.branch.longitude), label: formatINR(Number(d.salePrice)), title: d.title, href: `/deal/${d.id}` }]
          : [],
      ), [deals],
  );
  const showMap = !!category && isDealCategory(category) && mapPoints.length > 0;
  const showingMap = view === 'map' && showMap;
  const viewOptions: ViewOption[] = [
    { value: 'list', label: t.view.list, icon: 'view_list' },
    { value: 'grid', label: t.view.grid, icon: 'grid_view' },
    ...(showMap ? [{ value: 'map', label: t.view.map, icon: 'map' }] : []),
  ];
  const dealsLoading = list.status === 'loading';
  const dealsError = list.status === 'error' ? list.error : '';
  const [facets, setFacets] = useState<CatalogDealFacets | null>(null);
  useEffect(() => setFacets(null), [category?.id]);
  // Facet inputs as plain values, so the effect re-runs only when one of them really changes.
  const facetCategoryId = category && isDealCategory(category) && !cityPending && !cityMissing ? category.id : undefined;
  const facetSubcategoryId = activeSubcategory?.id;
  const facetCity = cityLocation?.city;
  const facetState = cityLocation?.state;
  const facetRadius = hasCoords ? radius : undefined;
  const vendorKey = vendorIds.join();
  const branchKey = branchIds.join();
  useEffect(() => {
    if (!facetCategoryId) return;
    let cancelled = false;
    getCatalogDealFacets({
      categoryId: facetCategoryId,
      subcategoryId: facetSubcategoryId,
      city: facetCity,
      state: facetState,
      latitude: lat,
      longitude: lng,
      radiusKm: facetRadius,
      vendorIds: toIds(vendorKey),
      branchIds: toIds(branchKey),
      minPrice,
      maxPrice,
    })
      .then(({ data }) => { if (!cancelled) setFacets(data); })
      // Facets are optional: a failed refresh keeps the last counts.
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [facetCategoryId, facetSubcategoryId, facetCity, facetState, lat, lng, facetRadius, vendorKey, branchKey, minPrice, maxPrice]);
  const desktop = useMediaQuery('(min-width: 840px)', true);
  const [panelOpen, setPanelOpen] = useState<boolean | null>(null);
  const filtersOpen = panelOpen ?? desktop;
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const priceBounds = facets?.price
    ? {
      min: Math.floor(facets.price.min / t.filters.step) * t.filters.step,
      max: Math.ceil(facets.price.max / t.filters.step) * t.filters.step,
      step: t.filters.step,
    }
    : { min: t.filters.min, max: t.filters.max, step: t.filters.step };
  const onRadius = (km: number | undefined) => setListParams({ radius: km != null ? String(km) : undefined });
  const onPrice = ({ min, max }: PriceRange) =>
    setListParams({ min: min != null ? String(min) : undefined, max: max != null ? String(max) : undefined });
  const onVendors = (ids: string[]) => setListParams({ vendor: ids.length ? ids.join(',') : undefined });
  const onBranches = (ids: string[]) => setListParams({ branch: ids.length ? ids.join(',') : undefined });
  const onClearAll = () => setListParams({ radius: undefined, min: undefined, max: undefined, vendor: undefined, branch: undefined });
  if (categoryLoading || cityPending) { return <p className="loading-state"> {t.loading}</p>; }
  if (categoryError || !category || cityMissing) {
    return (
      <PageSection stack aria-label={t.notFound.heading}>
        <Seo title={t.notFound.metaTitle} description={t.notFound.subheading} path={categoryHref(slug)} noindex />
        <sky-info-card icon="search_off" heading={t.notFound.heading} subheading={categoryError || t.notFound.subheading} />
        <div>
          <FilledButton onClick={() => navigate('/categories')}>{t.notFound.cta}</FilledButton>
        </div>
      </PageSection>
    );
  }
  const cityFilterable = category.type !== 'PRODUCT' && category.type !== 'THERAPY';
  const activeCity = cityFilterable ? cityLocation : undefined;
  const displayName = activeCity
    ? t.cityTitleTemplate.replace('{category}', category.name).replace('{city}', activeCity.city)
    : category.name;
  const description = activeCity
    ? t.cityMetaDescriptionTemplate.replace('{category}', category.name).replace('{city}', activeCity.city)
    : (category.description ?? t.metaDescriptionTemplate.replace('{category}', category.name));
  const path = activeCity ? cityHref(category.slug, activeCity.city) : categoryHref(category.slug);
  const crumbs = [
    { name: t.breadcrumb.home, path: '/' },
    { name: t.breadcrumb.categories, path: '/categories' },
    { name: category.name, path: categoryHref(category.slug) },
    ...(activeCity ? [{ name: activeCity.city, path }] : []),
  ];
  const filtersToggle = !isTherapyCategory
    ? createElement(
      'md-text-button',
      { 'aria-expanded': String(filtersOpen), onClick: () => setPanelOpen(!filtersOpen), },
      createElement('md-icon', { slot: 'icon', 'aria-hidden': 'true' }, 'tune'),
      desktop ? filtersOpen ? t.toolbar.hideFilters : t.toolbar.showFilters
        : activeFilters ? t.toolbar.filtersActive.replace('{count}', String(activeFilters)) : t.toolbar.filters,)
    : null;
  const count = list.total;
  const noun = isTherapyCategory ? t.resultCount.therapist : isProductCategory ? t.resultCount.product : t.dealCount;
  const countText = dealsLoading ? '' : `${count} ${count === 1 ? noun.singular : noun.plural}`;
  const empty = isTherapyCategory ? t.emptyTherapists : t.emptyDeals;
  const fallback = dealsLoading ? (
    <p className="loading-state">{t.loadingDeals}</p>
  ) : dealsError ? (
    <p className="error-state" role="alert">{dealsError}</p>
  ) : list.items.length === 0 ? (
    <sky-info-card icon="sentiment_dissatisfied" heading={empty.heading} subheading={empty.subheading} />
  ) : undefined;
  const pills =
    category.children.length > 0 ? (
      <ChipNav
        ariaLabel={t.pills.label}
        items={[{ value: '', label: t.tabs.all }, ...category.children.map((c) => ({ value: c.slug, label: c.name }))]}
        value={activeSubcategory?.slug ?? ''}
        onSelect={(value) => setParam('sub', value || undefined)}
      />
    ) : null;
  const cardLayout = view === 'list' ? 'horizontal' : undefined;
  const cards = isTherapyCategory
    ? sortedTherapists.map((therapist) => (
      <TherapistCard key={therapist.id} therapist={therapist} variant="outlined" layout={cardLayout}>
        <TherapistAddToCartDialog
          therapist={therapist}
          renderTrigger={(open) => (
            <FilledButton
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                open();
              }}
            >
              {t.actions.viewPackages}
            </FilledButton>
          )}
        />
      </TherapistCard>
    ))
    : isProductCategory
      ? products.map((product) => (
        <OfferCard slider
          key={product.id}
          item={{ type: 'product', product }}
          tag={popularTag(product.popularTags)}
          variant="outlined"
          layout={cardLayout ?? 'vertical'}
        />
      ))
      : deals.map((deal) => (
        <OfferCard slider
          key={deal.id}
          item={{ type: 'deal', deal }}
          tag={popularTag(deal.popularTags)}
          variant="outlined"
          layout={cardLayout ?? 'vertical'}
        />
      ));
  return (
    <>
      <Seo
        title={`${displayName}${t.metaTitleSuffix}`}
        description={description}
        path={path}
        noindex={!!citySlugParam && !activeCity}
        jsonLd={SITE_URL ? breadcrumbJsonLd(SITE_URL, crumbs) : undefined}
      />
      <PageSection stack aria-labelledby="category-heading">
        <Breadcrumb
          items={[
            { label: t.breadcrumb.home, to: '/' },
            { label: t.breadcrumb.categories, to: '/categories' },
            activeCity ? { label: category.name, to: categoryHref(category.slug) } : { label: category.name },
            ...(activeCity ? [{ label: activeCity.city }] : []),
          ]}
        />
        <SectionHead
          as="h1"
          id="category-heading"
          titleClassName="headline-large"
          heading={displayName}
          subheading={category.description ? <ClampText text={category.description} more={t.description.more} less={t.description.less} /> : undefined}
          actions={<span className="body-medium" aria-live="polite" aria-atomic="true">{countText}</span>}
          media={<PageHeadLogo />}
        />
        {pills}
      </PageSection>
      <BannerSlot slot="CATEGORY_TOP" />
      <PageSection tone="tint" stack aria-label={`${category.name} ${t.dealsAriaLabelSuffix}`}>
        <ListingToolbar
          ariaLabel={t.toolbar.label}
          start={filtersToggle ?? undefined}
          end={
            <>
              <ViewSwitch
                label={t.view.label}
                options={viewOptions}
                value={view}
                onChange={(v) => setParam('view', v === 'grid' ? undefined : v)}
              />
              <ChoiceMenu
                trigger="text"
                icon="swap_vert"
                label={t.toolbar.sort.replace('{label}', sortOption.label)}
                menuLabel={t.toolbar.sortMenu}
                options={sortMenuOptions}
                value={sortOption.value}
                onChange={(value) => setParam('sort', value === 'relevance' ? undefined : value)}
              />
            </>
          }
        />
        <SidebarLayout
          open={filtersOpen && !isTherapyCategory}
          onClose={() => setPanelOpen(false)}
          sidebarLabel={t.filterPanel.title}
          closeLabel={t.filterPanel.close}
          sidebar={
            <FilterPanel
              kind={isProductCategory ? 'products' : 'deals'}
              facets={facets}
              location={{ city: visitorCity, hasCoords }}
              onChangeLocation={() => { if (!desktop) setPanelOpen(false); setCityPickerOpen(true); }}
              radiusKm={radius}
              onRadius={onRadius}
              price={{ min: minPrice, max: maxPrice }}
              priceBounds={priceBounds}
              onPrice={onPrice}
              vendorIds={vendorIds}
              onVendors={onVendors}
              branchIds={branchIds}
              onBranches={onBranches}
              onClearAll={onClearAll}
              copy={t.filterPanel}
            />
          }
        >
          {showingMap ? (
            <>
              <DealMap points={mapPoints} ariaLabel={t.map.label} loadingLabel={t.map.loading} />
              {deals.length > mapPoints.length && (
                <p className="body-medium">
                  {deals.length - mapPoints.length === 1
                    ? t.map.missingOne
                    : t.map.missing.replace('{count}', String(deals.length - mapPoints.length))}
                </p>
              )}
            </>
          ) : (
            <CardGrid layout={view === 'list' ? 'list' : 'grid'} fallback={fallback}>{cards}</CardGrid>
          )}
          {list.status === 'ready' && list.items.length > 0 && (
            <LoadMore
              hasMore={list.hasMore}
              loading={list.loadingMore}
              error={list.error}
              status={t.loadMore.status.replace('{shown}', String(list.items.length)).replace('{total}', String(list.total))}
              onLoadMore={list.loadMore}
              copy={t.loadMore}
            />
          )}
        </SidebarLayout>
        {cityPickerOpen && <CityPickerDialog onClose={() => setCityPickerOpen(false)} />}
      </PageSection>
    </>
  );
}
export default Category;
