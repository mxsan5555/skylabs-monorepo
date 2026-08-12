import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  FilledButton,
  Icon,
  ChipSet,
  FilterChip,
  OutlinedSelect,
  SelectOption,
  Divider,
} from '@skylabs-monorepo/shared-ui/react';
import { useCart } from '../../../cart/cart-context';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { PRODUCTS, getProductsByCategory, CATEGORY_LABELS } from '../../../data/products';
import { SkyProductCardWC } from '../../components/sky-product-card-wc';
import { Breadcrumb } from '../../components/breadcrumb';
import { formatINR } from '../../../utils/format';
import type { ProductSort } from '../../../types';
import content from '../../../content.json';
import './products.css';

const { products } = content;

const FILTERS = [
  { value: 'all',        label: products.listing.filters.all },
  { value: 'day',        label: products.listing.filters.day },
  { value: 'night',      label: products.listing.filters.night },
  { value: 'skin-care',  label: products.listing.filters.skinCare },
];

const SITE_URL: string = (import.meta.env['VITE_SITE_URL'] as string | undefined) ?? '';

export function ProductListing() {
  const { addItem } = useCart();
  const { toggle, has } = useWishlist();
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [sort, setSort] = useState<ProductSort>('popular');

  const filteredProducts = useMemo(() => {
    const list = activeFilter === 'all' ? PRODUCTS : getProductsByCategory(activeFilter);
    switch (sort) {
      case 'price-asc':  return [...list].sort((a, b) => a.price - b.price);
      case 'price-desc': return [...list].sort((a, b) => b.price - a.price);
      case 'newest':     return [...list].sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
      default:           return [...list];
    }
  }, [activeFilter, sort]);

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: products.meta.listingTitle,
            url: `${SITE_URL}/products`,
            numberOfItems: PRODUCTS.length,
            itemListElement: PRODUCTS.map((p, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              name: p.name,
              url: `${SITE_URL}/products/${p.id}`,
            })),
          }),
        }}
      />

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

      {/* Single sticky row: filter chips + sort */}
      <div className="products-page__filter-bar" role="toolbar" aria-label="Filter and sort products">
        <div className="products-page__filter-bar-inner">
          <ChipSet aria-label="Filter by category">
            {FILTERS.map((f) => (
              <FilterChip
                key={f.value}
                label={f.label}
                selected={activeFilter === f.value}
                onClick={() => setActiveFilter(f.value)}
              />
            ))}
          </ChipSet>
          <span className="products-page__count" aria-live="polite" aria-atomic="true">
            {filteredProducts.length} {products.listing.resultLabel}
          </span>
          <OutlinedSelect
            className="products-page__sort-select"
            label={products.listing.sortLabel}
            value={sort}
            onInput={(e) => setSort((e.target as HTMLSelectElement).value as ProductSort)}
          >
            {products.listing.sortOptions.map((o) => (
              <SelectOption key={o.value} value={o.value}>
                {o.label}
              </SelectOption>
            ))}
          </OutlinedSelect>
        </div>
      </div>

      <Divider />

      {/* Grid */}
      <section className="products-page__grid-section" aria-label="Product results">
        {filteredProducts.length === 0 ? (
          <div className="products-page__empty" role="status">
            <sky-info-card
              icon="search_off"
              heading={products.listing.emptyHeading}
              subheading={products.listing.emptySubheading}
            />
          </div>
        ) : (
          <div className="products-page__grid">
            {filteredProducts.map((product) => (
              <Link
                key={product.id}
                className="products-page__card-wrap"
                to={`/products/${product.id}`}
              >
                <SkyProductCardWC
                  variant="outlined"
                  heading={product.name}
                  eyebrow={product.brand}
                  image={product.image}
                  imageAlt={product.imageAlt}
                  badge={CATEGORY_LABELS[product.categorySlug]}
                  price={formatINR(product.price)}
                  originalPrice={product.originalPrice ? formatINR(product.originalPrice) : undefined}
                  discount={product.discount ? `${product.discount}% OFF` : undefined}
                  favorite
                  favoriteActive={has(product.id)}
                  onFavorite={() => toggle(product.id)}
                >
                  <div
                    className="products-page__card-cta"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                  >
                    <FilledButton
                      className="products-page__card-btn"
                      onClick={() => addItem(product.id)}
                    >
                      <Icon slot="icon" aria-hidden="true">shopping_bag</Icon>
                      Add to Cart
                    </FilledButton>
                  </div>
                </SkyProductCardWC>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default ProductListing;
