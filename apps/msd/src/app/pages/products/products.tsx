import { useEffect, useMemo, useState } from 'react';
import {
  FilledButton,
  Icon,
  OutlinedTextField,
  OutlinedSelect,
  SelectOption,
  Divider,
} from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { useNavigate } from 'react-router-dom';
import { listCatalogDeals, type CatalogDeal } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { addCartItem } from '../../../api/cart';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { SkyProductCardWC } from '../../components/sky-product-card-wc';
import { Breadcrumb } from '../../components/breadcrumb';
import { formatINR } from '../../../utils/format';
import type { ProductSort } from '../../../types';
import content from '../../../content.json';
import './products.css';

const { products } = content;
const SITE_URL: string = (import.meta.env['VITE_SITE_URL'] as string | undefined) ?? '';

/**
 * All product-deals across every vendor/category — `GET /catalog/deals?type=product`, no
 * `categoryId` (unlike `/category/:slug`, which scopes to one category). `CatalogDeal` unifies
 * Service and Product as one Deal entity (`.product` populated for this page's `type=product`
 * query) — there is no separate flat "Product" backend entity, so this page is built around
 * Deal, not a Product record.
 */
export function ProductListing() {
  const { token, isAuthenticated } = useAuth();
  const { has: isWishlisted, toggle: toggleWishlist } = useWishlist();
  const navigate = useNavigate();
  const [deals, setDeals] = useState<CatalogDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ProductSort>('popular');
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    listCatalogDeals({ type: 'product', search: search || undefined, pageSize: 60 })
      .then(({ data }) => setDeals(data))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load products.'))
      .finally(() => setLoading(false));
  }, [search]);

  const sortedDeals = useMemo(() => {
    switch (sort) {
      case 'price-asc':
        return [...deals].sort((a, b) => Number(a.salePrice) - Number(b.salePrice));
      case 'price-desc':
        return [...deals].sort((a, b) => Number(b.salePrice) - Number(a.salePrice));
      default:
        return deals;
    }
  }, [deals, sort]);

  const requireAuthOrRedirect = () => {
    if (isAuthenticated) return true;
    navigate(`/sign-in?next=${encodeURIComponent('/products')}`);
    return false;
  };

  const addToCart = async (deal: CatalogDeal) => {
    if (!requireAuthOrRedirect()) return;
    setActionError('');
    setActionMessage('');
    try {
      await addCartItem(token, deal.id, 1);
      setActionMessage(`Added "${deal.product?.name ?? deal.title}" to your cart.`);
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : 'Could not add to cart.');
    }
  };

  const toggleFavorite = (deal: CatalogDeal) => {
    if (!requireAuthOrRedirect()) return;
    void toggleWishlist(deal.id);
  };

  return (
    <div id="main-content" className="products-page">
      <title>{products.meta.listingTitle}</title>
      <meta name="description" content={products.meta.listingDescription} />
      <link rel="canonical" href={`${SITE_URL}/products`} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={products.meta.listingTitle} />
      <meta property="og:description" content={products.meta.listingDescription} />
      <meta property="og:url" content={`${SITE_URL}/products`} />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={products.meta.listingTitle} />
      <meta name="twitter:description" content={products.meta.listingDescription} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
              { '@type': 'ListItem', position: 2, name: 'Products', item: `${SITE_URL}/products` },
            ],
          }),
        }}
      />
      {sortedDeals.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              name: products.meta.listingTitle,
              url: `${SITE_URL}/products`,
              numberOfItems: sortedDeals.length,
              itemListElement: sortedDeals.map((d, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                name: d.product?.name ?? d.title,
                url: `${SITE_URL}/products/${d.id}`,
              })),
            }),
          }}
        />
      )}

      {/* Breadcrumb */}
      <Breadcrumb
        className="products-page__breadcrumb"
        items={[
          { label: 'Home', to: '/' },
          { label: 'Products' },
        ]}
      />

      {/* Hero */}
      <section className="products-page__hero" aria-label="Products overview">
        <div className="products-page__hero-inner">
          <div className="products-page__hero-icon" aria-hidden="true">
            <Icon>local_florist</Icon>
          </div>
          <div>
            <h1 className="products-page__title">{products.listing.title}</h1>
            <p className="products-page__subtitle">{products.listing.subtitle}</p>
          </div>
        </div>
      </section>

      {/* Single sticky row: search + sort */}
      <div className="products-page__filter-bar" role="toolbar" aria-label="Search and sort products">
        <div className="products-page__filter-bar-inner">
          <OutlinedTextField
            label="Search"
            value={search}
            onInput={(e: Event) => setSearch((e.target as HTMLInputElement).value)}
          >
            <Icon slot="leading-icon" aria-hidden="true">search</Icon>
          </OutlinedTextField>
          <span className="products-page__count" aria-live="polite" aria-atomic="true">
            {loading ? '…' : `${sortedDeals.length} ${products.listing.resultLabel}`}
          </span>
          <OutlinedSelect
            className="products-page__sort-select"
            label={products.listing.sortLabel}
            value={sort}
            onInput={(e) => setSort((e.target as HTMLSelectElement).value as ProductSort)}
          >
            {products.listing.sortOptions
              .filter((o) => o.value !== 'newest')
              .map((o) => (
                <SelectOption key={o.value} value={o.value}>
                  {o.label}
                </SelectOption>
              ))}
          </OutlinedSelect>
        </div>
      </div>

      <Divider />

      {actionMessage && <p className="field-hint" role="status">{actionMessage}</p>}
      {actionError && <p className="error-state" role="alert">{actionError}</p>}

      {/* Grid */}
      <section className="products-page__grid-section" aria-label="Product results">
        {loading ? (
          <p className="loading-state">Loading products…</p>
        ) : error ? (
          <p className="error-state" role="alert">{error}</p>
        ) : sortedDeals.length === 0 ? (
          <div className="products-page__empty" role="status">
            <sky-info-card
              icon="search_off"
              heading={products.listing.emptyHeading}
              subheading={products.listing.emptySubheading}
            />
          </div>
        ) : (
          <div className="products-page__grid">
            {sortedDeals.map((deal) => (
              <div key={deal.id} className="products-page__card-wrap">
                <SkyProductCardWC
                  variant="outlined"
                  heading={deal.product?.name ?? deal.title}
                  eyebrow={deal.product?.brand ?? deal.vendor?.businessName ?? undefined}
                  image={deal.product?.image ?? deal.images?.[0] ?? undefined}
                  imageAlt={deal.product?.imageAlt ?? undefined}
                  price={formatINR(Number(deal.salePrice))}
                  originalPrice={
                    deal.originalPrice && Number(deal.originalPrice) !== Number(deal.salePrice)
                      ? formatINR(Number(deal.originalPrice))
                      : undefined
                  }
                  discount={deal.discountPercent ? `${deal.discountPercent}% OFF` : undefined}
                  href={`/products/${deal.id}`}
                  favorite
                  favoriteActive={isWishlisted(deal.id)}
                  onFavorite={() => toggleFavorite(deal)}
                >
                  <div
                    className="products-page__card-cta"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                  >
                    <FilledButton
                      className="products-page__card-btn"
                      onClick={() => addToCart(deal)}
                    >
                      <Icon slot="icon" aria-hidden="true">shopping_bag</Icon>
                      Add to Cart
                    </FilledButton>
                  </div>
                </SkyProductCardWC>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default ProductListing;
