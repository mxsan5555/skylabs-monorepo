import { useEffect, useState } from 'react';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { listCatalogCategories, type CatalogCategoryWithChildren } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { Breadcrumb } from '../../components/breadcrumb';
import content from '../../../content.json';
import '../category/category.css';
/**
 * Customer catalogue entry point — "browse all categories" (formerly the marketplace categories
 * index, absorbed here now that the marketplace route namespace is retired). Reuses
 * `category.css` (same hero/breadcrumb/grid classes as `/category/:slug`) and `sky-info-card`
 * (already used for empty states elsewhere in the storefront) so this reads as part of the same
 * storefront, not a second design. Deliberately public — no auth, no admin fields; backed by
 * `GET /catalog/categories`.
 */
export function CategoriesIndex() {
  const [categories, setCategories] = useState<CatalogCategoryWithChildren[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    setLoading(true);
    setError('');
    listCatalogCategories()
      .then(({ data }) => setCategories(data))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : content.categories.error.load))
      .finally(() => setLoading(false));
  }, []);
  return (
    <div className="category-page">
      <title>{content.categories.metaTitle}</title>
      <meta name="description" content={content.categories.metaDescription} />
      <Breadcrumb
        className="category-page__breadcrumb"
        items={[
          { label: content.categories.breadcrumb.home, to: '/', },
          { label: content.categories.breadcrumb.categories, },
        ]}
      />
      <header className="category-page__hero">
        <div className="category-page__hero-inner">
          <div className="category-page__hero-icon" aria-hidden="true">
            <Icon>storefront</Icon>
          </div>
          <div>
            <h1 className="category-page__title">{content.categories.title}</h1>
            <p className="category-page__subtitle">{content.categories.subtitle}</p>
          </div>
        </div>
      </header>
      <section className="category-page__grid-wrap" aria-label={content.categories.ariaLabel}>
        <div className="category-page__grid-inner">
          {loading ? (
            <p className="loading-state">{content.categories.loading}</p>
          ) : error ? (
            <p className="error-state" role="alert">{error}</p>
          ) : categories.length === 0 ? (
            <div className="category-page__empty">
              <sky-info-card icon="category" heading={content.categories.empty.title} subheading={content.categories.empty.description} />
            </div>
          ) : (
            <ul className="category-page__grid">
              {categories.map((category) => (
                <li key={category.id}>
                  <sky-category-card
                    heading={category.name}
                    subheading={category.description ?? `${category.children.length} ${category.children.length === 1 ? content.categories.subcategory.singular : content.categories.subcategory.plural}`} href={`/category/${category.slug}`}
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
export default CategoriesIndex;
