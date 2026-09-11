import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Icon,
  Tabs,
  PrimaryTab,
  OutlinedTextField,
  FilledButton,
  OutlinedButton,
} from '@skylabs-monorepo/shared-ui/react';
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
import { Breadcrumb } from '../../components/breadcrumb';
import { DealAddToCartDialog } from '../../components/deal-add-to-cart-dialog';
import { formatINR } from '../../../utils/format';
import { resolveDealMedia, resolveProductMedia, resolveTherapistMedia, primaryImage } from '../../../utils/media';
import { useCurrentLocation } from '../../../hooks/useCurrentLocation';
import './category.css';
import content from '../../../content.json';

/** Lowest active package price for a therapist listing card — mirrors `therapists.tsx`'s own
 *  `fromPrice` exactly (kept as a small local copy rather than a shared export, same as that
 *  file already does for its own single use). */
function therapistFromPrice(therapist: CatalogTherapist): number | null {
  if (therapist.packages.length === 0) return null;
  return Math.min(...therapist.packages.map((p) => Number(p.sellingPrice)));
}

/**
 * Category → Sub Category → (Deal | Product | Therapist) discovery page — the customer
 * catalogue's single canonical entry point. Reuses `category.css` and the existing
 * `Tabs`/`DealCard` components unchanged, but reads real Vendor/Branch/Deal/Therapist data from
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
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { token, isAuthenticated } = useAuth();
  const { has: isWishlisted, toggle: toggleWishlist } = useWishlist();
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [category, setCategory] = useState<CatalogCategoryWithChildren | null>(null);
  const [categoryLoading, setCategoryLoading] = useState(true);
  const [categoryError, setCategoryError] = useState('');
  const [subcategoryIdx, setSubcategoryIdx] = useState(0);
  const [search, setSearch] = useState('');
  const [deals, setDeals] = useState<CatalogDeal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [dealsError, setDealsError] = useState('');
  const [therapists, setTherapists] = useState<CatalogTherapist[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const { coords } = useCurrentLocation();

  useEffect(() => {
    setCategoryLoading(true);
    setCategoryError('');
    setSubcategoryIdx(0);
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
  }, [slug]);
  const activeSubcategory = subcategoryIdx === 0 ? undefined : category?.children[subcategoryIdx - 1];
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
    listCatalogDeals({
      categoryId: category.id,
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
  }, [category, activeSubcategory?.id, search, coords?.latitude, coords?.longitude]);

  if (categoryLoading) {
    return <p className="loading-state"> {content.category.loading}</p>;
  }
  if (categoryError || !category) {
    return (
      <div className="category-page category-page--empty">
        <title>{content.category.notFound.metaTitle}</title>
        <sky-info-card icon="search_off" heading={content.category.notFound.heading} subheading={categoryError || content.category.notFound.subheading} />
        <FilledButton onClick={() => navigate('/categories')}>{content.category.notFound.cta}</FilledButton>
      </div>
    );
  }
  return (
    <div className="category-page">
      <title>{`${category.name}${content.category.metaTitleSuffix}`}</title>
      <meta name="description" content={category.description ?? content.category.metaDescriptionTemplate.replace('{category}', category.name)} />
      <Breadcrumb
        className="category-page__breadcrumb"
        items={[
          { label: content.category.breadcrumb.home, to: '/' },
          { label: content.category.breadcrumb.categories, to: '/categories' },
          { label: category.name }
        ]} />
      <header className="category-page__hero">
        <div className="category-page__hero-inner">
          <div className="category-page__hero-icon" aria-hidden="true">
            <Icon>category</Icon>
          </div>
          <div>
            <h1 className="category-page__title">{category.name}</h1>
            {category.description && <p className="category-page__subtitle">{category.description}</p>}
          </div>
        </div>
      </header>
      {category.children.length > 0 && (
        <div className="category-page__tabs-wrap">
          <Tabs
            className="category-page__tabs"
            onChange={(e) => setSubcategoryIdx((e.target as unknown as { activeTabIndex: number }).activeTabIndex)}
          >
            <PrimaryTab active={subcategoryIdx === 0}> {content.category.tabs.all}</PrimaryTab>
            {category.children.map((sub, i) => (
              <PrimaryTab key={sub.id} active={subcategoryIdx === i + 1}>
                {sub.name}
              </PrimaryTab>
            ))}
          </Tabs>
        </div>
      )}
      <div className="category-page__sort">
        <div className="category-page__sort-inner">
          <OutlinedTextField
            label={content.category.searchLabel}
            value={search}
            onInput={(e: Event) => setSearch((e.target as HTMLInputElement).value)}
          />
          <p className="category-page__count" aria-live="polite" aria-atomic="true">
            {dealsLoading
              ? '…'
              : isTherapyCategory
                ? `${therapists.length} ${therapists.length === 1 ? 'therapist' : 'therapists'}`
                : isProductCategory
                  ? `${products.length} ${products.length === 1 ? 'product' : 'products'}`
                  : `${deals.length} ${deals.length === 1 ? content.category.dealCount.singular : content.category.dealCount.plural}`}
          </p>
        </div>
      </div>
      {actionMessage && <p className="field-hint" role="status">{actionMessage}</p>}
      {actionError && <p className="error-state" role="alert">{actionError}</p>}
      <section className="category-page__grid-wrap" aria-label={`${category.name} ${content.category.dealsAriaLabelSuffix}`}>
        <div className="category-page__grid-inner">
          {dealsLoading ? (
            <p className="loading-state">{content.category.loadingDeals}</p>
          ) : dealsError ? (
            <p className="error-state" role="alert">{dealsError}</p>
          ) : isTherapyCategory ? (
            therapists.length === 0 ? (
              <div className="category-page__empty">
                <sky-info-card icon="sentiment_dissatisfied" heading="No therapists yet" subheading="Check back soon." />
              </div>
            ) : (
              <ul className="category-page__grid">
                {therapists.map((t) => {
                  const price = therapistFromPrice(t);
                  return (
                    <li key={t.id}>
                      <SkyProductCardWC
                        image={primaryImage(resolveTherapistMedia(t))}
                        eyebrow={t.personName}
                        eyebrowHref={t.vendor?.slug ? `/vendor/${t.vendor.slug}` : undefined}
                        heading={t.therapistType}
                        location={t.branch?.city ?? undefined}
                        distance={t.distanceKm != null ? `${(Math.round(t.distanceKm * 10) / 10)} km` : undefined}
                        tag={t.popularTags?.[0]?.name}
                        pricePrefix={price != null ? 'From' : undefined}
                        price={price != null ? formatINR(price) : undefined}
                        href={`/therapist/${t.id}`}
                      />
                    </li>
                  );
                })}
              </ul>
            )
          ) : isProductCategory ? (
            products.length === 0 ? (
              <div className="category-page__empty">
                <sky-info-card icon="sentiment_dissatisfied" heading={content.category.emptyDeals.heading} subheading={content.category.emptyDeals.subheading} />
              </div>
            ) : (
              <ul className="category-page__grid">
                {products.map((product) => (
                  <li key={product.id}>
                    <DealCard
                      deal={{
                        id: product.id,
                        title: product.name,
                        image: primaryImage(resolveProductMedia(product)) ?? '',
                        imageAlt: product.imageAlt ?? '',
                        gallery: resolveProductMedia(product).images,
                        badge: content.category.offeringLabels.product,
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
                          <Icon slot="icon" aria-hidden="true">
                            shopping_bag
                          </Icon>
                          {content.category.actions.addToCart}
                        </FilledButton>
                      }
                    />
                  </li>
                ))}
              </ul>
            )
          ) : deals.length === 0 ? (
            <div className="category-page__empty">
              <sky-info-card icon="sentiment_dissatisfied" heading={content.category.emptyDeals.heading} subheading={content.category.emptyDeals.subheading} />
            </div>
          ) : (
            <ul className="category-page__grid">
              {deals.map((deal) => (
                <li key={deal.id}>
                  <DealCard
                    deal={{
                      id: deal.id,
                      title: deal.title,
                      image: primaryImage(resolveDealMedia(deal)) ?? '',
                      imageAlt: '',
                      gallery: resolveDealMedia(deal).images,
                      badge: content.category.offeringLabels.service,
                      providerName: [deal.vendor?.businessName, deal.branch?.name]
                        .filter(Boolean)
                        .join(' · '),
                      location: deal.branch?.city ?? undefined,
                      distance: deal.distanceKm != null ? Math.round(deal.distanceKm * 10) / 10 : undefined,
                      price: Number(deal.salePrice),
                      originalPrice:
                        deal.originalPrice &&
                          Number(deal.originalPrice) !== Number(deal.salePrice)
                          ? Number(deal.originalPrice)
                          : undefined,
                      discount: deal.discountPercent
                        ? Number(deal.discountPercent)
                        : undefined,
                      priceNote: deal.durationMinutes
                        ? `${deal.durationMinutes} ${content.category.durationSuffix}`
                        : undefined,
                      tag: deal.popularTags?.[0]?.name,
                    }}
                    eyebrowHref={
                      deal.vendor?.slug
                        ? `/vendor/${deal.vendor.slug}`
                        : undefined
                    }
                    favoriteActive={isWishlisted(deal.id)}
                    onFavorite={() => toggleFavorite(deal)}
                    actions={
                      <DealAddToCartDialog
                        deal={deal}
                        onAdded={(label) => setActionMessage(`Added "${label}" to your cart.`)}
                        renderTrigger={(open) => (
                          <OutlinedButton
                            onClick={() => {
                              if (requireAuthOrRedirect()) open();
                            }}
                          >
                            <Icon slot="icon" aria-hidden="true">
                              shopping_bag
                            </Icon>
                            Add to Cart
                          </OutlinedButton>
                        )}
                      />
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
export default Category;
