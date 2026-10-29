import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getBlogPost, type BlogPost } from '../../../../api/rbac/blog-posts';
import { renderBlock } from '../../../components/blog-blocks/blog-blocks';
import { ApiRequestError } from '../../../../api/rbac/client';
import { resolveMediaUrl } from '../../../../api/media';
import { formatDate } from '../../../../blog/blog';
import '../../blog-detail/blog-detail.css';

/** Read-only admin preview of a single Blog Post at `/account/cms/blog/:id` — reached from the
 *  Blog list's "View" row action. Renders the same block content the public post page would,
 *  plus the admin-only status/author/date/SEO-meta strip. */
export function BlogDetailAdmin({ scope = 'pages' }: { scope?: 'pages' | 'articles' }) {
  const baseRoute = scope === 'articles' ? '/account/cms/blog/articles' : '/account/cms/blog';
  const backLabel = scope === 'articles' ? 'Back to Articles' : 'Back to Blog';
  const loadPost = scope === 'articles' ? blogArticlesApi.getBlogPost : getBlogPost;
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      setPost(null);
      setError('Blog post not found.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    setPost(null);
    let current = true;
    loadPost(token, id)
      .then(({ data }) => { if (current) setPost(data); })
      .catch((err) => { if (current) setError(err instanceof ApiRequestError ? err.message : 'Could not load blog post.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [id, token, loadPost]);

  if (loading) {
    return (
      <div className="admin-page">
        <title>Blog post · MSD</title>
        <meta name="robots" content="noindex" />
        <p className="loading-state">Loading…</p>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="admin-page">
        <title>Blog post · MSD</title>
        <meta name="robots" content="noindex" />
        <p className="error-state" role="alert">{error || 'Blog post not found.'}</p>
        <Link to={baseRoute}>
          <Icon aria-hidden="true">arrow_back</Icon>
          {backLabel}
        </Link>
      </div>
    );
  }

  const primaryImage = post.mediaImages?.find((img) => img.isPrimary) ?? post.mediaImages?.[0];

  return (
    <div className="admin-page">
      <title>{post.title} · MSD</title>
      <meta name="robots" content="noindex" />
      <nav className="post__crumb" aria-label="Breadcrumb">
        <Link to={baseRoute}>
          <Icon aria-hidden="true">arrow_back</Icon>
          {backLabel}
        </Link>
      </nav>
      <header className="page-head">
        <div>
          <h1>{post.title}</h1>
          <p>
            <span>{post.status === 'PUBLISHED' ? 'Published' : 'Draft'}</span>
            <span aria-hidden="true"> · </span>
            <span>By {post.author}</span>
            <span aria-hidden="true"> · </span>
            <span>{post.publishedAt ? formatDate(post.publishedAt) : 'Not yet published'}</span>
            <span aria-hidden="true"> · </span>
            <span>{post.readMinutes} min read</span>
          </p>
        </div>
      </header>

      {primaryImage && (
        <img src={resolveMediaUrl(primaryImage.storageKey)} alt={post.title} width={800} height={480} className="post__cover" />
      )}

      <p className="field-hint">Category: {post.category?.name ?? '—'}</p>
      {post.metaTitle && <p className="field-hint">Meta title: {post.metaTitle}</p>}
      {post.metaDescription && <p className="field-hint">Meta description: {post.metaDescription}</p>}

      <div className="post__body">{post.body.map(renderBlock)}</div>

      {post.tags.length > 0 && (
        <ul className="post__tags" aria-label="Tags">
          {post.tags.map((t) => (
            <li key={t}>
              <sky-badge variant="tertiary" size="small">
                #{t}
              </sky-badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default BlogDetailAdmin;
