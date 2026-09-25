import { useEffect, useState } from 'react';
import { getCatalogPage, type CatalogWebsitePage } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { renderBlock } from '../blog-detail/blog-detail';
import './website-page.css';

/** One reusable public page for every fixed `WebsitePage` row (privacy/terms/accessibility/
 *  cookies) — `GET /catalog/pages/:slug` on mount + slug change, rendering the title and
 *  `content: BlogBlock[]` body exactly as saved from the CMS admin page
 *  (`pages/account/cms/legal-pages-list.tsx`), reusing `blog-detail.tsx`'s `renderBlock` (same
 *  approach as the public About Us page). A single parameterized component wired to 4 routes
 *  instead of 4 near-duplicate page files — see `routes.tsx`. */
export function WebsitePage({ slug }: { slug: string }) {
  const [page, setPage] = useState<CatalogWebsitePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setPage(null);
    getCatalogPage(slug)
      .then(({ data }) => {
        if (!cancelled) setPage(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiRequestError && err.code === 'NOT_FOUND'
              ? 'This page could not be found.'
              : err instanceof ApiRequestError
                ? err.message
                : 'Could not load this page.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <main className="website-page">
        <title>Loading… · MSD</title>
        <p className="loading-state">Loading…</p>
      </main>
    );
  }

  if (error || !page) {
    return (
      <main className="website-page">
        <title>Page not found · MSD</title>
        <meta name="robots" content="noindex" />
        <p className="error-state" role="alert">{error || 'This page is not available right now.'}</p>
      </main>
    );
  }

  return (
    <main className="website-page">
      <title>{page.metaTitle || `${page.title} · MSD`}</title>
      <meta name="description" content={page.metaDescription || page.title} />
      <article>
        <h1>{page.title}</h1>
        {page.content.length > 0 ? (
          <div className="post__body website-page__body">{page.content.map(renderBlock)}</div>
        ) : (
          <p className="empty-state">This page has no content yet.</p>
        )}
      </article>
    </main>
  );
}

export default WebsitePage;
