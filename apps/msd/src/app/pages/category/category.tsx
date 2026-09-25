import { createElement, useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon, Tabs, FilledButton, OutlinedButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  getCatalogCategory,
  listCatalogDeals,
  listCatalogProducts,
  listCatalogTherapists,
  type CatalogCategoryWithChildren,
  type CatalogDeal,
  type CatalogProduct,
  type CatalogTherapist,
} from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { DealCard } from '../../components/deal-card';
import { SkyProductCardWC } from '../../components/sky-product-card-wc';
import { addCartItem } from '../../../api/cart';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { useHydrated } from '../../../hooks/use-hydrated';
import { Breadcrumb } from '../../components/breadcrumb';
import { CardGrid } from '../../components/card-grid/card-grid';
import { PageSection } from '../../components/page-section/page-section';
import { SectionHead } from '../../components/section-head/section-head';
import { useCustomEvent } from '../../../hooks/use-custom-event';
import { DealAddToCartDialog } from '../../components/deal-add-to-cart-dialog';
import { formatINR } from '../../../utils/format';
import { resolveDealMedia, resolveProductMedia, resolveTherapistMedia, primaryImage } from '../../../utils/media';
import { useCurrentLocation } from '../../../hooks/useCurrentLocation';
import { citySlug, cityHref, categoryHref, useCatalogShell } from '../../../catalog/catalog-shell';
import { categoryDataKey, usePrerenderedData } from '../../../prerender-data/prerender-data';
import type { CategoryData } from '../../../prerender-data/loaders';
import { Seo } from '../../seo/seo';
import { breadcrumbJsonLd } from '../../seo/jsonld';
import { SITE_URL } from '../../seo/site-url';
import content from '../../../content.json';

const t = content.category;
const PANEL_ID = 'category-results';
const tabId = (id: string) => `category-tab-${id}`;

/** Raw `md-secondary-tab` so `id`/`aria-controls`/`active` render as attributes (same reason as
 *  home's DealsTab: the @lit/react wrapper sets `id` as a property only in the browser build). */
function SubcategoryTab({ id, active, children }: { id: string; active: boolean; children: ReactNode }) {
  return createElement('md-secondary-tab', { id: tabId(id), 'aria-controls': PANEL_ID, active }, children);
}

/** Search field. Its own component so `useCustomEvent` attaches when the element mounts
 *  (the page renders it only after the category loads). Controlled by `value`, so the active
 *  search stays visible after the field remounts (e.g. moving to another category). */
function SearchField({ value, placeholder, onSearch }: { value: string; placeholder: string; onSearch: (query: string) => void }) {
  const ref = useRef<HTMLElement>(null);
  useCustomEvent<{ value: string }>(ref, 'sky-submit', (e) => onSearch(e.detail.value));
  return (
    <sky-action-field
      ref={ref}
      role="search"
      type="search"
      enterkeyhint="search"
      icon="search"
      variant="outlined"
      dense
      label={t.searchLabel}
      value={value}
      placeholder={placeholder}
      action-label={t.search.action}
    />
  );
}

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

/**
 * Category → Sub Category → (Deal | Product | Therapist) discovery page — the customer
 * catalogue's single canonical entry point. Composes PageSection, SectionHead and CardGrid with
 * the existing `Tabs`/`DealCard` components unchanged, but reads real Vendor/Branch/Deal/Therapist data from
 * `GET /catalog/*` — only active, approved records with an active vendor/branch are ever
 * returned (enforced server-side in `catalog.service.ts`).
 *
 * `category.type` (`SERVICE | PRODUCT | THERAPY`) automatically determines what this page lists
 * — never a manual toggle: a SERVICE (or untyped, legacy) category shows Deal cards (`GET
 * /catalog/deals`), a PRODUCT category shows Product cards (`GET /catalog/products` — Product is
 * a fully independent catalog entity now, never a Deal), and a THERAPY category shows Therapist
 * cards (`GET /catalog/therapists`, filtered by `categoryId`/`subcategoryId`). "All" (the
 * default) shows every record in the category; selecting a subcategory tab narrows to that
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
  const { coords } = useCurrentLocation();
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
  const [search, setSearch] = useState('');
  const [deals, setDeals] = useState<CatalogDeal[]>(initialHasDeals ? initial.deals : []);
  const [dealsLoading, setDealsLoading] = useState(!initialHasDeals);
  const [dealsError, setDealsError] = useState('');
  // The "All" deals list the page shows unfiltered (the prerendered one, then its refresh), and
  // whether that background refresh has run.
  const allDealsRef = useRef<CatalogDeal[] | undefined>(initialHasDeals ? initial.deals : undefined);
  const dealsRefreshedRef = useRef(false);
  const [therapists, setTherapists] = useState<CatalogTherapist[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
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
  const setSubcategoryIdx = (idx: number) => {
    const sub = idx === 0 ? undefined : category?.children[idx - 1];
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (sub) next.set('sub', sub.slug);
        else next.delete('sub');
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

  useEffect(() => {
    if (!category) return;
    // The prerendered "All" list for this route, before any filter or location applies: keep it
    // on screen and refresh it once in the background; a failed refresh keeps it.
    if (
      initialHasDeals &&
      category.id === initial.category?.id &&
      deals === allDealsRef.current &&
      !activeSubcategory &&
      !search &&
      coords?.latitude == null &&
      coords?.longitude == null
    ) {
      if (dealsRefreshedRef.current) return;
      dealsRefreshedRef.current = true;
      listCatalogDeals({ categoryId: category.id, city: cityLocation?.city, state: cityLocation?.state, pageSize: 60 })
        .then(({ data }) => {
          allDealsRef.current = data ?? [];
          setDeals(allDealsRef.current);
        })
        .catch(() => undefined);
      return;
    }
    setDealsLoading(true);
    setDealsError('');
    if (category.type === 'THERAPY') {
      listCatalogTherapists({
        categoryId: category.id,
        subcategoryId: activeSubcategory?.id,
        search: search || undefined,
        pageSize: 60,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
      })
        .then(({ data }) => setTherapists(data))
        .catch((err) => setDealsError(err instanceof ApiRequestError ? err.message : content.category.errors.loadDeals))
        .finally(() => setDealsLoading(false));
      return;
    }
    if (category.type === 'PRODUCT') {
      // Product is a fully independent catalog entity now — its own listing API, never a
      // Deal with a `type` filter (see catalog.ts's own doc comment).
      listCatalogProducts({
        categoryId: category.id,
        subcategoryId: activeSubcategory?.id,
        search: search || undefined,
        pageSize: 60,
      })
        .then(({ data }) => setProducts(data))
        .catch((err) => setDealsError(err instanceof ApiRequestError ? err.message : content.category.errors.loadDeals))
        .finally(() => setDealsLoading(false));
      return;
    }
    if (cityPending) return;
    listCatalogDeals({
      categoryId: category.id,
      city: cityLocation?.city,
      state: cityLocation?.state,
      subcategoryId: activeSubcategory?.id,
      search: search || undefined,
      pageSize: 60,
      latitude: coords?.latitude,
      longitude: coords?.longitude,
    })
      .then(({ data }) => setDeals(data))
      .catch((err) => setDealsError(err instanceof ApiRequestError ? err.message : content.category.errors.loadDeals))
      .finally(() => setDealsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    category,
    activeSubcategory?.id,
    search,
    coords?.latitude,
    coords?.longitude,
    cityPending,
    cityLocation?.city,
    cityLocation?.state,
  ]);

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

  const count = isTherapyCategory ? therapists.length : isProductCategory ? products.length : deals.length;
  const noun = isTherapyCategory ? t.resultCount.therapist : isProductCategory ? t.resultCount.product : t.dealCount;
  const countText = dealsLoading ? '' : `${count} ${count === 1 ? noun.singular : noun.plural}`;
  const empty = isTherapyCategory ? t.emptyTherapists : t.emptyDeals;
  const fallback = dealsLoading ? (
    <p className="loading-state">{t.loadingDeals}</p>
  ) : dealsError ? (
    <p className="error-state" role="alert">{dealsError}</p>
  ) : count === 0 ? (
    <sky-info-card icon="sentiment_dissatisfied" heading={empty.heading} subheading={empty.subheading} />
  ) : undefined;

  const tabs =
    category.children.length > 0 ? (
      <Tabs
        aria-label={t.tabsLabel}
        onChange={(e) => setSubcategoryIdx((e.target as unknown as { activeTabIndex: number }).activeTabIndex)}
      >
        {[{ id: 'all', name: t.tabs.all }, ...category.children].map((tab, i) => (
          <SubcategoryTab key={tab.id} id={tab.id} active={subcategoryIdx === i}>
            {tab.name}
          </SubcategoryTab>
        ))}
      </Tabs>
    ) : null;

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
          subheading={category.description ?? undefined}
          actions={
            <>
              <span className="body-medium" aria-live="polite" aria-atomic="true">
                {countText}
              </span>
              <SearchField value={search} placeholder={t.search.placeholder.replace('{category}', category.name)} onSearch={setSearch} />
            </>
          }
        />
      </PageSection>
      <PageSection tone="tint" aria-label={`${category.name} ${t.dealsAriaLabelSuffix}`}>
        <CardGrid
          above={
            <>
              {tabs}
              {actionMessage && <p className="field-hint" role="status">{actionMessage}</p>}
              {actionError && <p className="error-state" role="alert">{actionError}</p>}
            </>
          }
          panel={tabs ? { id: PANEL_ID, labelledBy: tabId(activeSubcategory?.id ?? 'all') } : undefined}
          fallback={fallback}
        >
          {cards}
        </CardGrid>
      </PageSection>
    </>
  );
}
export default Category;
