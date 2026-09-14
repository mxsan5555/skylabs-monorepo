import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getBlogPost, type BlogPost, type BlogBlock } from '../../../../api/rbac/blog-posts';
import { ApiRequestError } from '../../../../api/rbac/client';
import { resolveMediaUrl } from '../../../../api/media';
import { formatDate } from '../../../../blog/blog';
import '../../blog-detail/blog-detail.css';

/** Render one article body block with the right semantic element — same switch/render approach
 *  as the public `blog-detail.tsx`'s own `renderBlock`, kept as a small local copy since the
 *  admin `BlogBlock` type (`api/rbac/blog-posts.ts`) is declared separately from the public
 *  frontend's `BlogBlock` (`types/index.ts`), matching this app's existing admin/public type
 *  split (e.g. `Category`/`CategoryInput` vs the consumer catalogue's own category types). */
function renderBlock(block: BlogBlock, i: number) {
  switch (block.type) {
    case 'heading':
      return <h2 key={i}>{block.text}</h2>;
    case 'list':
      return (
        <ul key={i}>
          {block.items.map((item, j) => (
            <li key={j}>{item}</li>
          ))}
        </ul>
      );
    case 'quote':
      return <blockquote key={i}>{block.text}</blockquote>;
    default:
      return <p key={i}>{block.text}</p>;
  }
}

/** Read-only admin preview of a single Blog Post at `/account/cms/blog/:id` — reached from the
 *  Blog list's "View" row action. Renders the same block content the public post page would,
 *  plus the admin-only status/author/date/SEO-meta strip. */
export function BlogDetailAdmin() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    getBlogPost(token, id)
      .then(({ data }) => setPost(data))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load blog post.'))
      .finally(() => setLoading(false));
  }, [id, token]);

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
        <Link to="/account/cms/blog">
          <Icon aria-hidden="true">arrow_back</Icon>
          Back to Blog
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
        <Link to="/account/cms/blog">
          <Icon aria-hidden="true">arrow_back</Icon>
          Back to Blog
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

      <p className="field-hint">Category: {post.categorySlug}</p>
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
