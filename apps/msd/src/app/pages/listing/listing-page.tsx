import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FilledButton } from '@skylabs-monorepo/shared-ui/react';
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
import { ApiRequestError } from '../../../api/rbac/client';
import { Breadcrumb } from '../../components/breadcrumb';
import { PageSection } from '../../components/page-section/page-section';
import { SectionHead } from '../../components/section-head/section-head';
import { PageHeadLogo } from '../../components/section-head/page-head-logo';
import { ChipNav } from '../../components/chip-nav/chip-nav';
import { ListingBody } from '../../components/listing/listing-body';
import { listingCards, listingNoun } from '../../components/listing/listing-cards';
import { countText, pickSort, sortOptionsFor, sortValuesFor, useListingParams, type ListingKind } from '../../components/listing/listing-params';
import { useListingFacets } from '../../components/listing/use-listing-facets';
import type { ListingFacets } from '../../components/filter-panel/filter-panel';
import type { DealMapPoint } from '../../components/deal-map/deal-map';
import { lowestPackagePrice } from '../../components/therapist-card/therapist-card';
import { usePagedList } from '../../../hooks/use-paged-list';
import { formatINR } from '../../../utils/format';
import { useVisitorLocation } from '../../../location/location-context';
import { categoryHref, citySlug, useCatalogShell } from '../../../catalog/catalog-shell';
import { listingDataKey, usePrerenderedData } from '../../../prerender-data/prerender-data';
import { CATEGORY_PAGE_SIZE, type ListingData } from '../../../prerender-data/loaders';
import { Seo } from '../../seo/seo';
import { breadcrumbJsonLd, itemListJsonLd } from '../../seo/jsonld';
import { SITE_URL } from '../../seo/site-url';
import content from '../../../content.json';

const t = content.category;

/** The kind a top-level category lists (untyped legacy categories list deals, as on the category page). */
const kindOfType = (type: string | null | undefined): ListingKind =>
  type === 'PRODUCT' ? 'products' : type === 'THERAPY' ? 'therapists' : 'deals';
const FACETS: Record<ListingKind, (opts: object) => Promise<{ data: ListingFacets | null | undefined }>> = {
  deals: getCatalogDealFacets,
  products: getCatalogProductFacets,
  therapists: getCatalogTherapistFacets,
};

/** `/deals`, `/products`, `/therapists`, and `/<kind>/<city>` for deals and therapists. */
export const listingHref = (kind: ListingKind, city?: string) => (city ? `/${kind}/${citySlug(city)}` : `/${kind}`);

/**
 * All deals, products or therapists (PLANNING §4 "Listing pages share the category layout"):
 * the category page's layout with category chips that link to `/category/:slug`, the total at
 * the end of the chip row, and the kind's filters and sorts. Products add a Category facet and
 * have no city pages. Prerendered with the default view's first page.
 */
export function ListingPage({ kind }: { kind: ListingKind }) {
  const copy = content.listingPages[kind];
  const { city: citySlugParam } = useParams<{ city?: string }>();
  const navigate = useNavigate();
  const { coords } = useVisitorLocation();
  const { categories, locationsStatus, locations } = useCatalogShell();
  const located = kind !== 'products';
  const cityLocation = located && citySlugParam ? locations.find((l) => citySlug(l.city) === citySlugParam) : undefined;
  const cityUnresolved = !!citySlugParam && !cityLocation;
  const cityPending = cityUnresolved && locationsStatus === 'loading';
  const cityMissing = cityUnresolved && locationsStatus === 'ready';
  const initial = usePrerenderedData<ListingData>(listingDataKey(kind, cityLocation?.city));

  const params = useListingParams();
  const { minPrice, maxPrice, radius, vendorIds, branchIds, tags, categoryIds } = params;
  const hasCoords = coords?.latitude != null && coords?.longitude != null;
  const sort = pickSort(params.sortParam, sortValuesFor(kind, hasCoords));
  const lat = coords?.latitude ?? undefined;
  const lng = coords?.longitude ?? undefined;
  const ready = !cityPending && !cityMissing;

  const base = {
    minPrice,
    maxPrice,
    ...(located
      ? {
          city: cityLocation?.city,
          state: cityLocation?.state,
          latitude: lat,
          longitude: lng,
          radiusKm: hasCoords ? radius : undefined,
          vendorIds,
          branchIds,
        }
      : { categoryIds }),
    ...(kind !== 'therapists' ? { tags } : {}),
  };
  const listKey = JSON.stringify([kind, base, sort]);
  const isDefaultView = !sort && minPrice == null && maxPrice == null && lat == null && lng == null && radius == null &&
    vendorIds.length === 0 && branchIds.length === 0 && tags.length === 0 && categoryIds.length === 0;
  const seed = initial && isDefaultView ? initial : undefined;
  const loadError = (err: unknown) => (err instanceof ApiRequestError ? err.message : t.errors.loadDeals);

  const dealList = usePagedList<CatalogDeal>(
    (page) => listCatalogDeals({ ...base, page, pageSize: CATEGORY_PAGE_SIZE, sort: sort as CatalogDealSort | undefined }),
    listKey,
    { enabled: ready && kind === 'deals', errorMessage: loadError, initial: kind === 'deals' ? (seed as ListingData<CatalogDeal>) : undefined },
  );
  const productList = usePagedList<CatalogProduct>(
    (page) => listCatalogProducts({ ...base, page, pageSize: CATEGORY_PAGE_SIZE, sort: sort as CatalogProductSort | undefined }),
    listKey,
    { enabled: ready && kind === 'products', errorMessage: loadError, initial: kind === 'products' ? (seed as ListingData<CatalogProduct>) : undefined },
  );
  const therapistList = usePagedList<CatalogTherapist>(
    (page) => listCatalogTherapists({ ...base, page, pageSize: CATEGORY_PAGE_SIZE, sort: sort as CatalogTherapistSort | undefined }),
    listKey,
    { enabled: ready && kind === 'therapists', errorMessage: loadError, initial: kind === 'therapists' ? (seed as ListingData<CatalogTherapist>) : undefined },
  );
  const list = kind === 'therapists' ? therapistList : kind === 'products' ? productList : dealList;
  const facets = useListingFacets<typeof base>(ready ? FACETS[kind] : null, base, kind);

  const deals = dealList.items;
  const mapPoints = useMemo<DealMapPoint[]>(
    () =>
      kind !== 'deals'
        ? []
        : deals.flatMap((d) =>
            d.branch?.latitude != null && d.branch?.longitude != null
              ? [{ id: d.id, lat: Number(d.branch.latitude), lng: Number(d.branch.longitude), label: formatINR(Number(d.salePrice)), title: d.title, href: `/deal/${d.id}` }]
              : [],
          ),
    [deals, kind],
  );

  if (cityPending) return <p className="loading-state">{t.loading}</p>;
  if (cityMissing) {
    return (
      <PageSection stack aria-label={t.notFound.heading}>
        <Seo title={t.notFound.metaTitle} description={t.notFound.subheading} path={listingHref(kind)} noindex />
        <sky-info-card icon="search_off" heading={t.notFound.heading} subheading={t.notFound.subheading} />
        <div>
          <FilledButton onClick={() => navigate(listingHref(kind))}>{copy.all}</FilledButton>
        </div>
      </PageSection>
    );
  }

  const city = cityLocation?.city;
  const cityCopy = 'cityTitle' in copy ? copy : undefined;
  const heading = city && cityCopy ? cityCopy.cityTitle.replace('{city}', city) : copy.title;
  const description = city && cityCopy ? cityCopy.cityDescription.replace('{city}', city) : copy.description;
  const path = listingHref(kind, city);
  const crumbs = [
    { name: t.breadcrumb.home, path: '/' },
    { name: copy.breadcrumb, path: listingHref(kind) },
    ...(city ? [{ name: city, path }] : []),
  ];
  const itemList =
    SITE_URL && list.items.length > 0
      ? itemListJsonLd(
          SITE_URL,
          kind === 'products'
            ? productList.items.map((p) => ({ name: p.name, path: `/products/${p.id}`, price: Number(p.price) }))
            : kind === 'therapists'
              ? therapistList.items.map((x) => ({ name: x.therapistType, path: `/therapist/${x.id}`, price: lowestPackagePrice(x.packages) ?? 0 }))
              : deals.map((d) => ({ name: d.title, path: `/deal/${d.id}`, price: Number(d.salePrice) })),
        )
      : undefined;

  const chips = [
    { value: '', label: copy.all, href: listingHref(kind, city) },
    ...categories.filter((c) => kindOfType(c.type) === kind).map((c) => ({ value: c.slug, label: c.name, href: categoryHref(c.slug) })),
  ];
  const count = (
    <span className="body-medium" aria-live="polite" aria-atomic="true">
      {countText(list.status, list.total, listingNoun(kind))}
    </span>
  );
  const cards = listingCards(
    kind === 'therapists' ? { kind, items: therapistList.items } : kind === 'products' ? { kind, items: productList.items } : { kind, items: deals },
    params.view,
  );

  return (
    <>
      <Seo
        title={`${heading}${t.metaTitleSuffix}`}
        description={description}
        path={path}
        jsonLd={SITE_URL ? [breadcrumbJsonLd(SITE_URL, crumbs), ...(itemList ? [itemList] : [])] : undefined}
      />
      <PageSection stack aria-labelledby="listing-heading">
        <Breadcrumb
          items={[
            { label: t.breadcrumb.home, to: '/' },
            city ? { label: copy.breadcrumb, to: listingHref(kind) } : { label: copy.breadcrumb },
            ...(city ? [{ label: city }] : []),
          ]}
        />
        <SectionHead
          as="h1"
          id="listing-heading"
          titleClassName="headline-large"
          heading={heading}
          subheading={description}
          media={<PageHeadLogo />}
        />
        <ChipNav ariaLabel={copy.chipsLabel} items={chips} value="" end={count} />
      </PageSection>
      <ListingBody
        kind={kind}
        ariaLabel={copy.ariaLabel}
        params={params}
        facets={facets}
        sortOptions={sortOptionsFor(kind, hasCoords, t.sortOptions)}
        sort={sort}
        list={list}
        cards={cards}
        empty={kind === 'therapists' ? t.emptyTherapists : kind === 'products' ? content.listingPages.products.empty : t.emptyDeals}
        mapPoints={mapPoints}
        withCategoryFacet={kind === 'products'}
      />
    </>
  );
}

export default ListingPage;
