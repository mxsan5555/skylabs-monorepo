import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { FilledButton } from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui/carousel';
import {
  getCatalogCategory,
  listCatalogDeals,
  listCatalogProducts,
  listCatalogTherapists,
  type CatalogCategoryWithChildren,
  type CatalogDeal,
  type CatalogDealSort,
  type CatalogProduct,
  type CatalogProductSort,
  type CatalogTherapist,
  type CatalogTherapistSort,
} from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { Breadcrumb } from '../../components/breadcrumb';
import { PageSection } from '../../components/page-section/page-section';
import { SectionHead } from '../../components/section-head/section-head';
import { PageHeadLogo } from '../../components/section-head/page-head-logo';
import { ChipNav } from '../../components/chip-nav/chip-nav';
import { ClampText } from '../../components/clamp-text/clamp-text';
import { ListingBody } from '../../components/listing/listing-body';
import { countText, kindOfCategoryType, pickSort, sortOptionsFor, sortValuesFor, useListingParams } from '../../components/listing/listing-params';
import { LISTING_FACETS, useListingFacets } from '../../components/listing/use-listing-facets';
import { dealMapPoints, listingCards, listingLoadError, listingNoun } from '../../components/listing/listing-cards';
import { usePagedList } from '../../../hooks/use-paged-list';
import { useVisitorLocation } from '../../../location/location-context';
import { citySlug, cityHref, categoryHref, useCatalogShell } from '../../../catalog/catalog-shell';
import { categoryDataKey, usePrerenderedData } from '../../../prerender-data/prerender-data';
import { CATEGORY_PAGE_SIZE, type CategoryData } from '../../../prerender-data/loaders';
import { Seo } from '../../seo/seo';
import { breadcrumbJsonLd } from '../../seo/jsonld';
import { SITE_URL } from '../../seo/site-url';
import { dealPath, productPath, therapistPath } from '../../seo/public-urls';
import content from '../../../content.json';
import { BannerSlot } from '../../components/banner-slot/banner-slot';
const t = content.category;

/** SERVICE (or untyped, legacy) categories list deals; PRODUCT/THERAPY list their own entities. */
function isDealCategory(category: CatalogCategoryWithChildren): boolean {
  return category.type !== 'PRODUCT' && category.type !== 'THERAPY';
}

/**
 * Category → Sub Category → (Deal | Product | Therapist) discovery page. `category.type`
 * (`SERVICE | PRODUCT | THERAPY`) picks what it lists — deals, products or therapists — and the
 * filter panel and sorts for that kind (PLANNING §4). The results band is the shared
 * `ListingBody`; this page owns the category data, heading, subcategory pills (with the total at
 * the end of their row) and SEO. Only active, approved records with an active vendor/branch are
 * ever returned (enforced server-side in `catalog.service.ts`).
 */
export function Category() {
  const { slug = '', city: citySlugParam } = useParams<{ slug: string; city?: string }>();
  const navigate = useNavigate();
  const { coords } = useVisitorLocation();
  const { locationsStatus, locations } = useCatalogShell();
  const cityLocation = citySlugParam ? locations.find((l) => citySlug(l.city) === citySlugParam) : undefined;
  const initial = usePrerenderedData<CategoryData>(categoryDataKey(slug, cityLocation?.city));
  const initialHasDeals = !!initial?.category && isDealCategory(initial.category);
  const [category, setCategory] = useState<CatalogCategoryWithChildren | null>(initial?.category ?? null);
  const [categoryLoading, setCategoryLoading] = useState(!initial);
  const [categoryError, setCategoryError] = useState('');
  const params = useListingParams();
  const { searchParams, setParams, minPrice, maxPrice, radius, vendorIds, branchIds, tags } = params;
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

  const kind = kindOfCategoryType(category?.type);
  const subSlug = searchParams.get('sub');
  const subcategoryIdx = (category?.children.findIndex((c) => c.slug === subSlug) ?? -1) + 1;
  const activeSubcategory = subcategoryIdx === 0 ? undefined : category?.children[subcategoryIdx - 1];
  const hasCoords = coords?.latitude != null && coords?.longitude != null;
  const sort = pickSort(params.sortParam, sortValuesFor(kind, hasCoords));
  const lat = coords?.latitude ?? undefined;
  const lng = coords?.longitude ?? undefined;
  const ready = !!category && !cityPending && !cityMissing;
  const located = kind !== 'products';
  // City pages exist for deal categories only; therapists here follow the visitor's location.
  const city = kind === 'deals' ? cityLocation : undefined;

  // One filter set per kind, shared by the list and its facets (facets drop paging and sort).
  const base = {
    categoryId: category?.id,
    subcategoryId: activeSubcategory?.id,
    minPrice,
    maxPrice,
    ...(located
      ? {
          city: city?.city,
          state: city?.state,
          latitude: lat,
          longitude: lng,
          radiusKm: hasCoords ? radius : undefined,
          vendorIds,
          branchIds,
        }
      : { vendorIds }),
    ...(kind !== 'therapists' ? { tags } : {}),
  };
  const listKey = JSON.stringify([kind, base, sort]);
  const isDefaultView = !activeSubcategory && !sort && minPrice == null && maxPrice == null && lat == null && lng == null &&
    radius == null && vendorIds.length === 0 && branchIds.length === 0 && tags.length === 0;
  const loadError = listingLoadError(kind);

  const dealList = usePagedList<CatalogDeal>(
    (page) => listCatalogDeals({ ...base, page, pageSize: CATEGORY_PAGE_SIZE, sort: sort as CatalogDealSort | undefined }),
    listKey,
    {
      enabled: ready && kind === 'deals',
      errorMessage: loadError,
      initial: initialHasDeals && isDefaultView ? { items: initial.deals, total: initial.total ?? initial.deals.length } : undefined,
    },
  );
  const productList = usePagedList<CatalogProduct>(
    (page) => listCatalogProducts({ ...base, page, pageSize: CATEGORY_PAGE_SIZE, sort: sort as CatalogProductSort | undefined }),
    listKey,
    { enabled: ready && kind === 'products', errorMessage: loadError },
  );
  const therapistList = usePagedList<CatalogTherapist>(
    (page) => listCatalogTherapists({ ...base, page, pageSize: CATEGORY_PAGE_SIZE, sort: sort as CatalogTherapistSort | undefined }),
    listKey,
    { enabled: ready && kind === 'therapists', errorMessage: loadError },
  );
  const list = kind === 'therapists' ? therapistList : kind === 'products' ? productList : dealList;

  const facets = useListingFacets<typeof base>(ready ? LISTING_FACETS[kind] : null, base, category?.id);

  const deals = dealList.items;
  if (categoryLoading || cityPending) { return <p className="loading-state"> {t.loading}</p>; }
  if (categoryError || !category || cityMissing) {
    return (
      <PageSection stack aria-label={t.notFound.heading}>
        <Seo title={t.notFound.metaTitle} description={t.notFound.subheading} path={categoryHref(slug)} noindex />
        <h1 className="sr-only">{t.notFound.heading}</h1>
        <sky-info-card icon="search_off" heading={t.notFound.heading} subheading={categoryError || t.notFound.subheading} />
        <div>
          <FilledButton onClick={() => navigate('/categories')}>{t.notFound.cta}</FilledButton>
        </div>
      </PageSection>
    );
  }
  const activeCity = isDealCategory(category) ? cityLocation : undefined;
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
  const count = <span className="body-medium" aria-live="polite" aria-atomic="true">{countText(list.status, list.total, listingNoun(kind))}</span>;
  const cards = listingCards(
    kind === 'therapists' ? { kind, items: therapistList.items } : kind === 'products' ? { kind, items: productList.items } : { kind, items: deals },
    params.view,
  );
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
          media={<PageHeadLogo />}
        />
        <ChipNav
          ariaLabel={t.pills.label}
          items={category.children.length > 0 ? [{ value: '', label: t.tabs.all }, ...category.children.map((c) => ({ value: c.slug, label: c.name }))] : []}
          value={activeSubcategory?.slug ?? ''}
          onSelect={(value) => setParams({ sub: value || undefined })}
          end={count}
        />
      </PageSection>
      <BannerSlot slot="CATEGORY_TOP" />
      <ListingBody
        kind={kind}
        ariaLabel={`${category.name} ${t.dealsAriaLabelSuffix}`}
        params={params}
        facets={facets}
        sortOptions={sortOptionsFor(kind, hasCoords, t.sortOptions)}
        sort={sort}
        list={list}
        cards={cards}
        mapPoints={kind === 'deals' ? dealMapPoints(deals) : undefined}
      />
    </>
  );
}
export default Category;
