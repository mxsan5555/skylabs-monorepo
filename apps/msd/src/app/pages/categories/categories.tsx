import { useEffect, useState } from 'react';
import { listCatalogCategories, type CatalogCategoryWithChildren } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { Breadcrumb } from '../../components/breadcrumb';
import { CardGrid } from '../../components/card-grid/card-grid';
import { PageSection } from '../../components/page-section/page-section';
import { SectionHead } from '../../components/section-head/section-head';
import { Seo } from '../../seo/seo';
import { pluralize } from '../../../utils/format';
import content from '../../../content.json';

const t = content.categories;

/** Public "browse all categories" index (`GET /catalog/categories`), composed from the same
 *  storefront blocks as `/category/:slug`. */
export function CategoriesIndex() {
  const [categories, setCategories] = useState<CatalogCategoryWithChildren[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    setLoading(true);
    setError('');
    listCatalogCategories()
      .then(({ data }) => setCategories(data))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : t.error.load))
      .finally(() => setLoading(false));
  }, []);

  const fallback = loading ? (
    <p className="loading-state" role="status">{t.loading}</p>
  ) : error ? (
    <p className="error-state" role="alert">{error}</p>
  ) : categories.length === 0 ? (
    <sky-info-card icon="category" heading={t.empty.title} subheading={t.empty.description} />
  ) : undefined;

  return (
    <>
      <Seo title={t.metaTitle} description={t.metaDescription} path={t.path} />
      <PageSection stack aria-labelledby="categories-heading">
        <Breadcrumb items={[{ label: t.breadcrumb.home, to: '/' }, { label: t.breadcrumb.categories }]} />
        <SectionHead as="h1" id="categories-heading" titleClassName="headline-large" heading={t.title} subheading={t.subtitle} />
      </PageSection>
      <PageSection tone="tint" aria-label={t.ariaLabel}>
        <CardGrid fallback={fallback}>
          {categories.map((category) => (
            <sky-category-card
              key={category.id}
              heading={category.name}
              subheading={
                category.description ??
                `${category.children.length} ${pluralize(category.children.length, t.subcategory.singular, t.subcategory.plural)}`
              }
              href={`/category/${category.slug}`}
            />
          ))}
        </CardGrid>
      </PageSection>
    </>
  );
}

export default CategoriesIndex;
