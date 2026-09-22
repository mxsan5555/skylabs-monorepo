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
  listCatalogProducts,
  type CatalogProduct,
} from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { addCartItem } from '../../../api/cart';

import { Breadcrumb } from '../../components/breadcrumb';

import { formatINR } from '../../../utils/format';
import { resolveProductMedia, primaryImage } from '../../../utils/media';
import type { ProductSort } from '../../../types';

import content from '../../../content.json';

import './products.css';

const { products } = content;

const SITE_URL =
  (import.meta.env['VITE_SITE_URL'] as string | undefined) ?? '';

/**
 * All products across every vendor/category — Product is a fully independent, directly
 * purchasable catalog entity now (see msd-api's Product schema doc comment), never a Deal.
 *
 * GET /catalog/products
 */
export function ProductListing() {
  const { token, isAuthenticated } = useAuth();

  const navigate = useNavigate();

  const [productsData, setProductsData] = useState<CatalogProduct[]>([]);
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

    listCatalogProducts({
      search: search.trim() || undefined,
      pageSize: 60,
    })
      .then(({ data }) => {
        if (!cancelled) {
          setProductsData(data);
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
  const sortedProducts = useMemo(() => {
    switch (sort) {
      case 'price-asc':
        return [...productsData].sort(
          (a, b) =>
            Number(a.price) -
            Number(b.price),
        );

      case 'price-desc':
        return [...productsData].sort(
          (a, b) =>
            Number(b.price) -
            Number(a.price),
        );

      default:
        return productsData;
    }
  }, [productsData, sort]);

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
    product: CatalogProduct,
  ) => {
    if (!requireAuthOrRedirect()) {
      return;
    }

    setActionError('');
    setActionMessage('');

    try {
      await addCartItem(
        token,
        { productId: product.id, quantity: 1 },
      );

      setActionMessage(
        products.listing.addToCartSuccess.replace(
          '{item}',
          product.name,
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
      {sortedProducts.length > 0 && (
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
                sortedProducts.length,
              itemListElement:
                sortedProducts.map(
                  (product, index) => ({
                    '@type': 'ListItem',
                    position: index + 1,
                    name: product.name,
                    url: `${SITE_URL}/products/${product.id}`,
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
              : `${sortedProducts.length} ${products.listing.resultLabel}`}
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
        ) : sortedProducts.length === 0 ? (
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
            {sortedProducts.map((product) => {
              const salePrice = Number(product.price);

              const originalPrice =
                product.originalPrice != null
                  ? Number(product.originalPrice)
                  : undefined;

              const media = resolveProductMedia(product);

              const image = primaryImage(media);

              return (
                <div
                  key={product.id}
                  className="products-page__card-wrap"
                >
               <DealCard
  deal={{
    id: product.id,
    title: product.name,
    image: image ?? '',
    imageAlt: product.imageAlt ?? product.name,
    gallery: media.images,
    badge: 'Product',
    providerName: product.brand ?? product.vendor?.businessName ?? undefined,
    price: salePrice,
    originalPrice:
      originalPrice !== undefined &&
      originalPrice !== salePrice
        ? originalPrice
        : undefined,
    discount: product.discount ?? undefined,
    tag: product.popularTags?.[0]?.name,
  }}
  href={`/products/${product.id}`}
  favoriteActive={false}
  onFavorite={() => {}}
  actions={
    <FilledButton
      type="button"
      className="products-page__card-btn"
      onClick={() => void addToCart(product)}
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