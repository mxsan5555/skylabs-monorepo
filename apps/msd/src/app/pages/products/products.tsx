import { useEffect, useMemo, useState } from 'react';
import {
  Divider,
  FilledButton,
  Icon,
  OutlinedSelect,
  OutlinedTextField,
  SelectOption,
} from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { useNavigate } from 'react-router-dom';
import { DealCard } from '../../components/deal-card';
import {
  listCatalogDeals,
  type CatalogDeal,
} from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { addCartItem } from '../../../api/cart';
import { useWishlist } from '../../../wishlist/wishlist-context';

import { SkyProductCardWC } from '../../components/sky-product-card-wc';
import { Breadcrumb } from '../../components/breadcrumb';

import { formatINR } from '../../../utils/format';
import { resolveDealMedia, primaryImage } from '../../../utils/media';
import type { ProductSort } from '../../../types';

import content from '../../../content.json';

import './products.css';

const { products } = content;

const SITE_URL =
  (import.meta.env['VITE_SITE_URL'] as string | undefined) ?? '';

/**
 * All product deals across every vendor/category.
 *
 * GET /catalog/deals?type=product
 *
 * CatalogDeal unifies Service and Product as one Deal entity.
 * For this page the backend query is scoped to type=product,
 * so deal.product is populated.
 */
export function ProductListing() {
  const { token, isAuthenticated } = useAuth();

  const {
    has: isWishlisted,
    toggle: toggleWishlist,
  } = useWishlist();

  const navigate = useNavigate();

  const [deals, setDeals] = useState<CatalogDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [sort, setSort] =
    useState<ProductSort>('popular');

  const [actionMessage, setActionMessage] =
    useState('');

  const [actionError, setActionError] =
    useState('');

  /*
   * Load products.
   */
  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError('');

    listCatalogDeals({
      type: 'product',
      search: search.trim() || undefined,
      pageSize: 60,
    })
      .then(({ data }) => {
        if (!cancelled) {
          setDeals(data);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }

        setError(
          err instanceof ApiRequestError
            ? err.message
            : products.listing.errors.load,
        );
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [search]);

  /*
   * Sort products locally.
   */
  const sortedDeals = useMemo(() => {
    switch (sort) {
      case 'price-asc':
        return [...deals].sort(
          (a, b) =>
            Number(a.salePrice) -
            Number(b.salePrice),
        );

      case 'price-desc':
        return [...deals].sort(
          (a, b) =>
            Number(b.salePrice) -
            Number(a.salePrice),
        );

      default:
        return deals;
    }
  }, [deals, sort]);

  /*
   * Authentication guard.
   */
  const requireAuthOrRedirect = () => {
    if (isAuthenticated) {
      return true;
    }

    navigate(
      `/sign-in?next=${encodeURIComponent(
        '/products',
      )}`,
    );

    return false;
  };

  /*
   * Add product to cart.
   */
  const addToCart = async (
    deal: CatalogDeal,
  ) => {
    if (!requireAuthOrRedirect()) {
      return;
    }

    setActionError('');
    setActionMessage('');

    try {
      await addCartItem(
        token,
        deal.id,
        1,
      );

      setActionMessage(
        products.listing.addToCartSuccess.replace(
          '{item}',
          deal.product?.name ?? deal.title,
        ),
      );
    } catch (err: unknown) {
      setActionError(
        err instanceof ApiRequestError
          ? err.message
          : products.listing.addToCartError,
      );
    }
  };

  /*
   * Wishlist toggle.
   */
  const toggleFavorite = (
    deal: CatalogDeal,
  ) => {
    if (!requireAuthOrRedirect()) {
      return;
    }

    void toggleWishlist(deal.id);
  };

  return (
    <div
      id="main-content"
      className="products-page"
    >
      {/* SEO */}
      <title>
        {products.meta.listingTitle}
      </title>

      <meta
        name="description"
        content={
          products.meta.listingDescription
        }
      />

      <link
        rel="canonical"
        href={`${SITE_URL}/products`}
      />

      <meta
        property="og:type"
        content="website"
      />

      <meta
        property="og:title"
        content={
          products.meta.listingTitle
        }
      />

      <meta
        property="og:description"
        content={
          products.meta.listingDescription
        }
      />

      <meta
        property="og:url"
        content={`${SITE_URL}/products`}
      />

      <meta
        name="twitter:card"
        content="summary"
      />

      <meta
        name="twitter:title"
        content={
          products.meta.listingTitle
        }
      />

      <meta
        name="twitter:description"
        content={
          products.meta.listingDescription
        }
      />

      {/* Breadcrumb structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context':
              'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              {
                '@type': 'ListItem',
                position: 1,
                name: 'Home',
                item: `${SITE_URL}/`,
              },
              {
                '@type': 'ListItem',
                position: 2,
                name: 'Products',
                item: `${SITE_URL}/products`,
              },
            ],
          }),
        }}
      />

      {/* Product list structured data */}
      {sortedDeals.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context':
                'https://schema.org',
              '@type': 'ItemList',
              name:
                products.meta.listingTitle,
              url: `${SITE_URL}/products`,
              numberOfItems:
                sortedDeals.length,
              itemListElement:
                sortedDeals.map(
                  (deal, index) => ({
                    '@type': 'ListItem',
                    position: index + 1,
                    name:
                      deal.product?.name ??
                      deal.title,
                    url: `${SITE_URL}/products/${deal.id}`,
                  }),
                ),
            }),
          }}
        />
      )}

      {/* Breadcrumb */}
      <Breadcrumb
        className="products-page__breadcrumb"
        items={[
          {
            label: products.listing.breadcrumb.home,
            to: '/',
          },
          {
            label: products.listing.breadcrumb.products,
          },
        ]}
      />

      {/* Hero */}
      <section
        className="products-page__hero"
        aria-label="Products overview"
      >
        <div className="products-page__hero-inner">
          <div
            className="products-page__hero-icon"
            aria-hidden="true"
          >
            <Icon>
              local_florist
            </Icon>
          </div>

          <div>
            <h1 className="products-page__title">
              {products.listing.title}
            </h1>

            <p className="products-page__subtitle">
              {products.listing.subtitle}
            </p>
          </div>
        </div>
      </section>

      {/* Search + Sort */}
      <div
        className="products-page__filter-bar"
        role="toolbar"
        aria-label={products.listing.filterAriaLabel}
      >
        <div className="products-page__filter-bar-inner">
          <OutlinedTextField
            label={products.listing.searchLabel}
            value={search}
            onInput={(event: Event) => {
              const target =
                event.target as HTMLInputElement;

              setSearch(target.value);
            }}
          >
            <Icon
              slot="leading-icon"
              aria-hidden="true"
            >
              search
            </Icon>
          </OutlinedTextField>

          <span
            className="products-page__count"
            aria-live="polite"
            aria-atomic="true"
          >
            {loading
              ? '…'
              : `${sortedDeals.length} ${products.listing.resultLabel}`}
          </span>

          <OutlinedSelect
            className="products-page__sort-select"
            label={
              products.listing.sortLabel
            }
            value={sort}
            onInput={(event: Event) => {
              const target =
                event.target as HTMLSelectElement;

              setSort(
                target.value as ProductSort,
              );
            }}
          >
            {products.listing.sortOptions
              .filter(
                (option) =>
                  option.value !==
                  'newest',
              )
              .map((option) => (
                <SelectOption
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </SelectOption>
              ))}
          </OutlinedSelect>
        </div>
      </div>

      <Divider />

      {/* Action messages */}
      {actionMessage && (
        <p
          className="field-hint"
          role="status"
        >
          {actionMessage}
        </p>
      )}

      {actionError && (
        <p
          className="error-state"
          role="alert"
        >
          {actionError}
        </p>
      )}

      {/* Product Grid */}
      <section
        className="products-page__grid-section"
        aria-label={products.listing.resultsAriaLabel}
      >
        {loading ? (
          <p className="loading-state">
            {products.listing.loading}
          </p>
        ) : error ? (
          <p
            className="error-state"
            role="alert"
          >
            {error}
          </p>
        ) : sortedDeals.length === 0 ? (
          <div
            className="products-page__empty"
            role="status"
          >
            <sky-info-card
              icon="search_off"
              heading={
                products.listing.emptyHeading
              }
              subheading={
                products.listing
                  .emptySubheading
              }
            />
          </div>
        ) : (
          <div className="products-page__grid">
            {sortedDeals.map((deal) => {
              const productName =
                deal.product?.name ??
                deal.title;

              const salePrice = Number(
                deal.salePrice,
              );

              const originalPrice =
                deal.originalPrice != null
                  ? Number(
                    deal.originalPrice,
                  )
                  : undefined;

              const media = resolveDealMedia(deal);

              const image = primaryImage(media);

              return (
                <div
                  key={deal.id}
                  className="products-page__card-wrap"
                >
               <DealCard
  deal={{
    id: deal.id,
    title: productName,
    image: image ?? '',
    imageAlt:
      deal.product?.imageAlt ?? productName,
    gallery: media.images,
    badge: 'Product',
    providerName:
      deal.product?.brand ??
      deal.vendor?.businessName ??
      undefined,
    price: salePrice,
    originalPrice:
      originalPrice !== undefined &&
      originalPrice !== salePrice
        ? originalPrice
        : undefined,
    discount: deal.discountPercent
      ? Number(deal.discountPercent)
      : undefined,
    isProduct: true,
  }}
  favoriteActive={isWishlisted(deal.id)}
  onFavorite={() => toggleFavorite(deal)}
  actions={
    <FilledButton
      type="button"
      className="products-page__card-btn"
      onClick={() => void addToCart(deal)}
    >
      <Icon slot="icon" aria-hidden="true">
        shopping_bag
      </Icon>

      {products.listing.addToCart}
    </FilledButton>
  }
/>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default ProductListing;