import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import type { BlogBlock, BlogPost } from '../../../types';
import { getPost, categoryName, formatDate } from '../../../blog/blog';
import './blog-detail.css';
import content from '../../../content.json';
/** Render one article body block with the right semantic element. Exported so the public About
 *  Us page (`pages/about/about.tsx`) can reuse the exact same block-rendering approach for its
 *  own `body: BlogBlock[]` field — both share this app's canonical public `BlogBlock` type
 *  (`types/index.ts`), unlike the admin CMS module's separately-declared `BlogBlock`. */
export function renderBlock(block: BlogBlock, i: number) {
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
/** Blog detail: a single article, looked up by `:slug` via `GET /catalog/blog-posts/:slug`
 *  (see `blog/blog.ts`'s own doc comment). `getPost` resolves to `null` for an unpublished or
 *  nonexistent slug — same "not found" state as before, just reached without a throw. */
export function BlogDetail() {
  const { slug } = useParams();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) {
      setPost(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getPost(slug)
      .then((result) => {
        if (!cancelled) setPost(result);
      })
      .catch(() => {
        if (!cancelled) setPost(null);
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
      <main className="post post--missing">
        <title>Loading… · MSD</title>
        <p className="loading-state">Loading…</p>
      </main>
    );
  }

  if (!post) {
    return (
      <main className="post post--missing">
        <title>{content.blog.detail.articleNotFoundTitle}</title>
        <meta name="robots" content="noindex" />
        <h1>{content.blog.detail.articleNotFoundHeading}</h1>
        <p>{content.blog.detail.articleNotFoundMessage}</p>
        <Link to="/blog">{content.blog.detail.backToBlog}</Link>
      </main>
    );
  }
  return (
    <main className="post">
      <title> {`${post.title}${content.blog.detail.metaTitleSuffix}`}</title>
      <meta name="description" content={post.excerpt} />
      <article>
        <nav
          className="post__crumb"
          aria-label={content.blog.detail.breadcrumbLabel}
        >
          <Link to="/blog">
            <Icon aria-hidden="true">arrow_back</Icon>
            {content.blog.detail.blogLabel}
          </Link>
        </nav>
        <header className="post__header">
          <sky-badge variant="secondary"> {categoryName(post.categorySlug)}</sky-badge>
          <h1>{post.title}</h1>
          <p className="post__meta">
            <span>By {post.author}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
            <span aria-hidden="true">·</span>
            <span className="post__read">
              <Icon aria-hidden="true">schedule</Icon>
              {post.readMinutes} {content.blog.detail.readMinutesSuffix}
            </span>
          </p>
        </header>
        <img
          className="post__cover"
          src={post.coverImage}
          alt={post.imageAlt}
          width={800}
          height={480}
        />
        <div className="post__body">{post.body.map(renderBlock)}</div>
        <footer className="post__footer">
          {post.tags.length > 0 && (
            <ul className="post__tags" aria-label={content.blog.detail.tagsLabel}>
              {post.tags.map((t) => (
                <li key={t}>
                  <sky-badge variant="tertiary" size="small">
                    #{t}
                  </sky-badge>
                </li>
              ))}
            </ul>
          )}
          <Link className="post__back" to="/blog">
            <Icon aria-hidden="true">arrow_back</Icon>
            {content.blog.detail.backToAllArticles}
          </Link>
        </footer>
      </article>
    </main>
  );
}
export default BlogDetail;
