import { useEffect, useState } from 'react';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { listCatalogCategories, type CatalogCategoryWithChildren } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { Breadcrumb } from '../../components/breadcrumb';
import '../category/category.css';

/**
 * Customer catalogue entry point — `Category → Sub Category → Service/Product → Deal`
 * discovery flow (marketplace architecture plan, Phase 6). Reuses `category.css` (same
 * hero/breadcrumb/grid classes as the existing static `/category/:slug` page) and
 * `sky-info-card` (already used for empty states elsewhere in the storefront) so this reads as
 * part of the same storefront, not a second design. Deliberately public — no auth, no admin
 * fields; backed by `GET /catalog/categories`.
 */
export function MarketplaceCategories() {
  const [categories, setCategories] = useState<CatalogCategoryWithChildren[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    listCatalogCategories()
      .then(({ data }) => setCategories(data))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load categories.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="category-page">
      <title>Browse the Marketplace | MSD</title>
      <meta name="description" content="Browse services and products by category — compare vendors, branches, and prices." />

      <Breadcrumb className="category-page__breadcrumb" items={[{ label: 'Home', to: '/' }, { label: 'Marketplace' }]} />

      <header className="category-page__hero">
        <div className="category-page__hero-inner">
          <div className="category-page__hero-icon" aria-hidden="true">
            <Icon>storefront</Icon>
          </div>
          <div>
            <h1 className="category-page__title">Marketplace</h1>
            <p className="category-page__subtitle">Browse services and products by category from vendors near you.</p>
          </div>
        </div>
      </header>

      <section className="category-page__grid-wrap" aria-label="Categories">
        <div className="category-page__grid-inner">
          {loading ? (
            <p className="loading-state">Loading categories…</p>
          ) : error ? (
            <p className="error-state" role="alert">{error}</p>
          ) : categories.length === 0 ? (
            <div className="category-page__empty">
              <sky-info-card icon="category" heading="No categories yet" subheading="Check back soon." />
            </div>
          ) : (
            <ul className="category-page__grid">
              {categories.map((category) => (
                <li key={category.id}>
                  <sky-category-card
                    heading={category.name}
                    subheading={category.description ?? `${category.children.length} sub-categor${category.children.length === 1 ? 'y' : 'ies'}`}
                    href={`/marketplace/${category.slug}`}
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

export default MarketplaceCategories;
