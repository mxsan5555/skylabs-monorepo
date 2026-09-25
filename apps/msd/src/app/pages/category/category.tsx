import { createElement, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon, FilledButton, OutlinedButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  getCatalogCategory,
  getCatalogDealFacets,
  listCatalogDeals,
  listCatalogProducts,
  listCatalogTherapists,
  type CatalogCategoryWithChildren,
  type CatalogDeal,
  type CatalogDealFacets,
  type CatalogDealSort,
  type CatalogProduct,
  type CatalogTherapist,
} from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { DealCard } from '../../components/deal-card';
import { SkyProductCardWC } from '../../components/sky-product-card-wc';
import { addCartItem } from '../../../api/cart';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { useHydrated } from '../../../hooks/use-hydrated';
import { useMediaQuery } from '../../../hooks/use-media-query';
import { Breadcrumb } from '../../components/breadcrumb';
import { CardGrid } from '../../components/card-grid/card-grid';
import { PageSection } from '../../components/page-section/page-section';
import { SectionHead } from '../../components/section-head/section-head';
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
import { DealAddToCartDialog } from '../../components/deal-add-to-cart-dialog';
import { formatINR } from '../../../utils/format';
import { resolveDealMedia, resolveProductMedia, resolveTherapistMedia, primaryImage } from '../../../utils/media';
import { useVisitorLocation } from '../../../location/location-context';
import { citySlug, cityHref, categoryHref, useCatalogShell } from '../../../catalog/catalog-shell';
import { categoryDataKey, usePrerenderedData } from '../../../prerender-data/prerender-data';
import { CATEGORY_PAGE_SIZE, type CategoryData } from '../../../prerender-data/loaders';
import { Seo } from '../../seo/seo';
import { breadcrumbJsonLd } from '../../seo/jsonld';
import { SITE_URL } from '../../seo/site-url';
import content from '../../../content.json';

const t = content.category;

/** msd-api's deal sort enum, minus `newest`/`discount` (superseded by price/distance sorts on
 *  this page; those two values are kept server-side only for other, unmigrated callers). */
const SORTS = ['relevance', 'price_asc', 'price_desc', 'distance'] as const;

/** SERVICE (or untyped, legacy) categories list deals; PRODUCT/THERAPY list their own entities. */
function isDealCategory(category: CatalogCategoryWithChildren): boolean {
  return category.type !== 'PRODUCT' && category.type !== 'THERAPY';
}

/** Lowest active package price for a therapist listing card — mirrors `therapists.tsx`'s own
 *  `fromPrice` exactly (kept as a small local copy rather than a shared export, same as that
 *  file already does for its own single use). */
function therapistFromPrice(therapist: CatalogTherapist): number | null {
  if (therapist.packages.length === 0) return null;
  return Math.min(...therapist.packages.map((p) => Number(p.sellingPrice)));
}

/** A non-negative number from a query param, or undefined. */
function toPrice(value: string | null): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
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
  const { token, isAuthenticated } = useAuth();
  // Rendering decisions wait for hydration so they match the prerendered (signed-out) HTML.
  const signedIn = useHydrated() && isAuthenticated;
  const { has: isWishlisted, toggle: toggleWishlist } = useWishlist();
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const { coords, city: visitorCity } = useVisitorLocation();
  const { locationsStatus, locations } = useCatalogShell();
  const cityLocation = citySlugParam ? locations.find((l) => citySlug(l.city) === citySlugParam) : undefined;
  // A prerendered page embeds this slug's (and resolved city's) category + "All" deals. The key
  // includes both, so `initial` only exists when it describes exactly this route.
  const initial = usePrerenderedData<CategoryData>(categoryDataKey(slug, cityLocation?.city));
  const initialHasDeals = !!initial?.category && isDealCategory(initial.category);
  const [category, setCategory] = useState<CatalogCategoryWithChildren | null>(initial?.category ?? null);
  const [categoryLoading, setCategoryLoading] = useState(!initial);
  const [categoryError, setCategoryError] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const cityUnresolved = !!citySlugParam && !cityLocation;
  // Locations arrive with the catalog shell; until then a city URL can't be resolved.
  const cityPending = cityUnresolved && locationsStatus === 'loading';
  // Only a successful locations fetch can prove a city doesn't exist. If it failed, the page
  // falls back to the plain (noindexed) category page rather than 404ing a real city.
  const cityMissing = cityUnresolved && locationsStatus === 'ready';

  useEffect(() => {
    // Still showing the prerendered (build-time) category for this slug: keep it on screen and
    // refresh it once in the background. Only a 404 replaces it; any other failure keeps it.
    if (initial && category === initial.category) {
      let cancelled = false;
      getCatalogCategory(slug)
        .then(({ data }) => {
          if (!cancelled && JSON.stringify(data) !== JSON.stringify(initial.category)) setCategory(data);
        })
        .catch((err) => {
          if (!cancelled && err instanceof ApiRequestError && err.status === 404) setCategory(null);
        });
      return () => {
        cancelled = true;
      };
    }
    setCategoryLoading(true);
    setCategoryError('');
    getCatalogCategory(slug)
      .then(({ data }) => setCategory(data))
      .catch((err) => {
        // A 404 here just means "unknown/inactive category slug" — render as not-found, not an error banner.
        if (err instanceof ApiRequestError && err.status === 404) {
          setCategory(null);
        } else {
          setCategoryError(err instanceof ApiRequestError ? err.message : content.category.errors.loadCategory);
        }
      })
      .finally(() => setCategoryLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
  // The subcategory tab lives in `?sub=<slug>` so header/sheet links can open a tab directly;
  // an unknown slug falls back to "All" (index 0).
  const subSlug = searchParams.get('sub');
  const subcategoryIdx = (category?.children.findIndex((c) => c.slug === subSlug) ?? -1) + 1;
  const activeSubcategory = subcategoryIdx === 0 ? undefined : category?.children[subcategoryIdx - 1];
  const sortParam = searchParams.get('sort');
  const sort =
    (SORTS as readonly string[]).includes(sortParam ?? '') && sortParam !== 'relevance' ? (sortParam as CatalogDealSort) : undefined;
  const hasCoords = coords?.latitude != null && coords?.longitude != null;
  const sortOption = t.sortOptions.find((o) => o.value === (sort ?? 'relevance')) ?? t.sortOptions[0];
  const sortMenuOptions = t.sortOptions.filter((o) => o.value !== 'distance' || hasCoords);
  const viewParam = searchParams.get('view');
  const view = viewParam === 'list' || viewParam === 'map' ? viewParam : 'grid';
  const minPrice = toPrice(searchParams.get('min'));
  const maxPrice = toPrice(searchParams.get('max'));
  const radius = toPrice(searchParams.get('radius'));
  const vendorIds = toIds(searchParams.get('vendor'));
  const branchIds = toIds(searchParams.get('branch'));
  const activeFilters = [radius != null, minPrice != null || maxPrice != null, vendorIds.length > 0, branchIds.length > 0].filter(
    Boolean,
  ).length;
  /** Writes one query param (or removes it when empty), keeping the others. */
  const setParam = (key: string, value: string | undefined) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  };
  /** Writes several query params at once (or removes ones set to `undefined`), keeping the others. */
  const setListParams = (patch: Record<string, string | undefined>) => {
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
  };
  const requireAuthOrRedirect = () => {
    if (isAuthenticated) return true;
    navigate(`/sign-in?next=${encodeURIComponent(`/category/${slug}`)}`);
    return false;
  };
  const addProductToCart = async (product: CatalogProduct) => {
    if (!requireAuthOrRedirect()) return;
    setActionError('');
    setActionMessage('');
    try {
      await addCartItem(token, { productId: product.id, quantity: 1 });
      setActionMessage(content.category.messages.addToCartSuccess.replace('{item}', product.name));
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : content.category.errors.addToCart);
    }
  };
  const toggleFavorite = (deal: CatalogDeal) => {
    if (!requireAuthOrRedirect()) return;
    void toggleWishlist(deal.id);
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
  // Any change here restarts the list at page 1.
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
  // The prerendered first page only describes the default ("All", unsorted, no location) view.
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
    // Products have no distance concept — a `distance` sort never reaches this call.
    (page) => listCatalogProducts({ ...common, page, sort: sort !== 'distance' ? sort : undefined, minPrice, maxPrice }),
    listKey,
    {
      enabled: category?.type === 'PRODUCT',
      errorMessage: loadError,
    },
  );
  const therapistList = usePagedList<CatalogTherapist>(
    (page) => listCatalogTherapists({ ...common, page, latitude: lat, longitude: lng }),
    listKey,
    { enabled: category?.type === 'THERAPY', errorMessage: loadError },
  );
  const list = isTherapyCategory ? therapistList : isProductCategory ? productList : dealList;
  const deals = dealList.items;
  const products = productList.items;
  const therapists = therapistList.items;
  const mapPoints = useMemo<DealMapPoint[]>(
    () =>
      deals.flatMap((d) =>
        d.branch?.latitude != null && d.branch?.longitude != null
          ? [{ id: d.id, lat: Number(d.branch.latitude), lng: Number(d.branch.longitude), label: formatINR(Number(d.salePrice)), title: d.title, href: `/deal/${d.id}` }]
          : [],
      ),
    [deals],
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

  // Filter-panel facet counts (business/branch/distance/price) for deal categories only; ignores
  // stale responses and keeps the previous facets on error so the panel never flashes empty.
  const [facets, setFacets] = useState<CatalogDealFacets | null>(null);
  useEffect(() => {
    if (!category || !isDealCategory(category) || cityPending || cityMissing) return;
    let cancelled = false;
    getCatalogDealFacets({
      categoryId: category.id,
      subcategoryId: activeSubcategory?.id,
      city: cityLocation?.city,
      state: cityLocation?.state,
      latitude: lat,
      longitude: lng,
      radiusKm: hasCoords ? radius : undefined,
      vendorIds,
      branchIds,
      minPrice,
      maxPrice,
    })
      .then(({ data }) => {
        if (!cancelled) setFacets(data);
      })
      .catch(() => {
        // Keep the previous facets on a failed refetch.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category?.id, activeSubcategory?.id, cityLocation?.city, lat, lng, radius, vendorIds.join(), branchIds.join(), minPrice, maxPrice]);

  // Filter side panel: a column open by default on desktop, a closed side sheet on phones, until
  // the visitor overrides it (`panelOpen`), which then wins regardless of viewport.
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

  // Hold the page (and its canonical) until the city resolves, so a city URL never briefly
  // announces itself as the plain category page.
  if (categoryLoading || cityPending) {
    return <p className="loading-state"> {t.loading}</p>;
  }
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
  // Product and therapist listings can't be filtered by city, so a city URL on those categories
  // shows the plain category page (noindexed) rather than a thin "X in City" duplicate.
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
        {
          'aria-expanded': String(filtersOpen),
          onClick: () => setPanelOpen(!filtersOpen),
        },
        createElement('md-icon', { slot: 'icon', 'aria-hidden': 'true' }, 'tune'),
        desktop
          ? filtersOpen
            ? t.toolbar.hideFilters
            : t.toolbar.showFilters
          : activeFilters
            ? t.toolbar.filtersActive.replace('{count}', String(activeFilters))
            : t.toolbar.filters,
      )
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
    ? therapists.map((therapist) => {
        const price = therapistFromPrice(therapist);
        return (
          <SkyProductCardWC
            key={therapist.id}
            image={primaryImage(resolveTherapistMedia(therapist))}
            eyebrow={therapist.personName}
            eyebrowHref={therapist.vendor?.slug ? `/vendor/${therapist.vendor.slug}` : undefined}
            heading={therapist.therapistType}
            location={therapist.branch?.city ?? undefined}
            distance={therapist.distanceKm != null ? `${Math.round(therapist.distanceKm * 10) / 10} km` : undefined}
            tag={therapist.popularTags?.[0]?.name}
            pricePrefix={price != null ? t.therapistPricePrefix : undefined}
            price={price != null ? formatINR(price) : undefined}
            href={`/therapist/${therapist.id}`}
            layout={cardLayout}
          />
        );
      })
    : isProductCategory
      ? products.map((product) => (
          <DealCard
            key={product.id}
            deal={{
              id: product.id,
              title: product.name,
              image: primaryImage(resolveProductMedia(product)) ?? '',
              imageAlt: product.imageAlt ?? '',
              gallery: resolveProductMedia(product).images,
              badge: t.offeringLabels.product,
              providerName: product.vendor?.businessName ?? '',
              price: Number(product.price),
              originalPrice:
                product.originalPrice && Number(product.originalPrice) !== Number(product.price)
                  ? Number(product.originalPrice)
                  : undefined,
              discount: product.discount ?? undefined,
              tag: product.popularTags?.[0]?.name,
            }}
            href={`/products/${product.id}`}
            eyebrowHref={product.vendor?.slug ? `/vendor/${product.vendor.slug}` : undefined}
            favoriteActive={false}
            onFavorite={() => {}}
            layout={cardLayout}
            actions={
              <FilledButton onClick={() => addProductToCart(product)}>
                <Icon slot="icon" aria-hidden="true">shopping_bag</Icon>
                {t.actions.addToCart}
              </FilledButton>
            }
          />
        ))
      : deals.map((deal) => (
          <DealCard
            key={deal.id}
            deal={{
              id: deal.id,
              title: deal.title,
              image: primaryImage(resolveDealMedia(deal)) ?? '',
              imageAlt: '',
              gallery: resolveDealMedia(deal).images,
              badge: t.offeringLabels.service,
              providerName: [deal.vendor?.businessName, deal.branch?.name].filter(Boolean).join(' · '),
              location: deal.branch?.city ?? undefined,
              distance: deal.distanceKm != null ? Math.round(deal.distanceKm * 10) / 10 : undefined,
              price: Number(deal.salePrice),
              originalPrice:
                deal.originalPrice && Number(deal.originalPrice) !== Number(deal.salePrice)
                  ? Number(deal.originalPrice)
                  : undefined,
              discount: deal.discountPercent ? Number(deal.discountPercent) : undefined,
              priceNote: deal.durationMinutes ? `${deal.durationMinutes} ${t.durationSuffix}` : undefined,
              tag: deal.popularTags?.[0]?.name,
            }}
            eyebrowHref={deal.vendor?.slug ? `/vendor/${deal.vendor.slug}` : undefined}
            favoriteActive={signedIn && isWishlisted(deal.id)}
            onFavorite={() => toggleFavorite(deal)}
            layout={cardLayout}
            actions={
              <DealAddToCartDialog
                deal={deal}
                onAdded={(label) => setActionMessage(t.messages.addToCartSuccess.replace('{item}', label))}
                renderTrigger={(open) => (
                  <OutlinedButton
                    onClick={() => {
                      if (requireAuthOrRedirect()) open();
                    }}
                  >
                    <Icon slot="icon" aria-hidden="true">shopping_bag</Icon>
                    {t.actions.addToCart}
                  </OutlinedButton>
                )}
              />
            }
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
          actions={
            <span className="body-medium" aria-live="polite" aria-atomic="true">
              {countText}
            </span>
          }
        />
        {pills}
      </PageSection>
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
              {!isTherapyCategory && (
                <ChoiceMenu
                  trigger="text"
                  icon="swap_vert"
                  label={t.toolbar.sort.replace('{label}', sortOption.label)}
                  menuLabel={t.toolbar.sortMenu}
                  options={sortMenuOptions}
                  value={sortOption.value}
                  onChange={(value) => setParam('sort', value === 'relevance' ? undefined : value)}
                />
              )}
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
              onChangeLocation={() => setCityPickerOpen(true)}
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
          {actionMessage && <p className="field-hint" role="status">{actionMessage}</p>}
          {actionError && <p className="error-state" role="alert">{actionError}</p>}
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
            <CardGrid layout={view === 'list' ? 'list' : 'grid'} fallback={fallback}>
              {cards}
            </CardGrid>
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
