import { useState } from 'react';
import {
  ChipSet,
  FilterChip,
  Icon,
} from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui';
import ProductCard from '../../components/product-card';
import { Breadcrumb } from '../../components/breadcrumb';
import { products } from '../../../data/products';
import type { DealSort } from '../../../types';
import content from '../../../content.json';
import '../category/category.css';

const SORT_OPTIONS = content.products.sortOptions as {
  value: DealSort;
  label: string;
}[];

export function Products() {
  const [sort, setSort] = useState<DealSort>('popular');

  // Temporary until we implement sorting
  const sortedProducts = [...products];

  return (
    <div className="category-page">
      <title>Products | MSD</title>

      <meta
        name="description"
        content="Browse wellness and skincare products from our affiliate partners."
      />

      {/* Breadcrumb */}
      <Breadcrumb
        className="category-page__breadcrumb"
        items={[
          { label: 'Home', to: '/' },
          { label: 'Products' },
        ]}
      />

      {/* Hero */}
      <header className="category-page__hero">
        <div className="category-page__hero-inner">
          <div className="category-page__hero-icon" aria-hidden="true">
            <Icon>inventory_2</Icon>
          </div>

          <div>
            <h1 className="category-page__title">
              {content.products.title}
            </h1>

            <p className="category-page__subtitle">
              {products.length} products · {content.products.subtitle}
            </p>
          </div>
        </div>
      </header>

      {/* Sort */}
      <div className="category-page__sort">
        <div className="category-page__sort-inner">
          <ChipSet>
            {SORT_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.value}
                label={opt.label}
                selected={sort === opt.value}
                onClick={() => setSort(opt.value)}
              />
            ))}
          </ChipSet>

          <p
            className="category-page__count"
            aria-live="polite"
            aria-atomic="true"
          >
            {sortedProducts.length}{' '}
            {sortedProducts.length === 1 ? 'product' : 'products'}
          </p>
        </div>
      </div>

      {/* Product Grid */}
      <section
        className="category-page__grid-wrap"
        aria-label="Products"
      >
        <div className="category-page__grid-inner">
          {sortedProducts.length === 0 ? (
            <div className="category-page__empty">
              <SkyInfoCardReact
                icon="inventory_2"
                heading={content.products.emptyTitle}
                subheading={content.products.emptySubtitle}
              />
            </div>
          ) : (
            <ul className="category-page__grid">
              {sortedProducts.map((product) => (
                <li key={product.id}>
                  <ProductCard product={product} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

export default Products;