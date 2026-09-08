/**
 * Blog data + access functions for msd.
 *
 * Backed by msd-api's public, unauthenticated CMS catalogue (`GET /catalog/blog-posts`,
 * `GET /catalog/blog-posts/:slug` — see `catalog.routes.ts`). This was previously a static
 * in-memory array with the same function signatures (`listPosts` → `GET /posts?page`, `getPost`
 * → `GET /posts/:slug`) by design, so this is that anticipated one-file swap — every call site
 * (`blog.tsx`/`blog-detail.tsx`) keeps calling these same exported names, just `await`ed now.
 *
 * The public list endpoint only accepts `search`/`categorySlug`/`page`/`pageSize` server-side
 * (see msd-api's `PublicBlogPostListQuerySchema` — deliberately no facet/author/tag/reading-time
 * filter param, and no dedicated "list all categories/authors/tags" endpoint). `sort`, `reading`,
 * multi-category, `authors`, and `tags` are therefore applied client-side over whichever single
 * page the server returned, and `categoryList()`/`authorList()`/`tagList()` are derived from that
 * same last-fetched page — an accepted limitation carried over from the static-data version
 * (which faceted its whole array; this one facets its current page), not a new one introduced by
 * this swap. Building dedicated facet endpoints is out of scope here.
 */
import { apiGet, ApiRequestError } from '../api/rbac/client';
import { resolveMediaUrl } from '../api/media';
import type { BlogCategory, BlogPost, BlogQuery, Paginated } from '../types';

export const PAGE_SIZE = 4;

interface ApiBlogPostImage {
  id: string;
  storageKey: string;
  isPrimary: boolean;
  sortOrder: number;
}

/** Shape of one row from `PUBLIC_BLOG_POST_SELECT` (msd-api's `blog-post.service.ts`) — no
 *  `coverImage`/`imageAlt` (those are frontend-only fields on `BlogPost`, mapped in `toBlogPost`
 *  below); `mediaImages` replaces them. */
interface ApiBlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  categorySlug: string;
  body: BlogPost['body'];
  author: string;
  readMinutes: number;
  tags: string[];
  publishedAt: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  mediaImages: ApiBlogPostImage[];
}

/** Title Case display fallback for a category slug (`massage-tips` → `Massage Tips`) — the
 *  backend's `BlogPost.categorySlug` is a plain string column with no linked display-name row
 *  (see schema.prisma — unlike the old static `CATEGORIES` array, which hardcoded a `name` per
 *  slug), so there is no real display name to read. This is a pure presentation transform of the
 *  slug itself, not new data. */
function humanizeSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Resolves the cover image URL from `mediaImages` (primary image, or the first uploaded if none
 *  is flagged primary) — empty string when no image has been uploaded yet. `sky-card`/plain
 *  `<img>` usage on both blog pages already tolerates an empty `src` (renders no image rather
 *  than a broken-image icon), so no placeholder asset is introduced. */
function coverImageFor(images: ApiBlogPostImage[]): string {
  if (images.length === 0) return '';
  const primary = images.find((img) => img.isPrimary) ?? [...images].sort((a, b) => a.sortOrder - b.sortOrder)[0];
  return resolveMediaUrl(primary.storageKey);
}

/** Maps one API row onto the frontend's own `BlogPost` shape (`types/index.ts`, unchanged by
 *  this swap) — `imageAlt` falls back to the post's `title` since `BlogPostImage` has no
 *  dedicated alt-text column (see schema.prisma). */
function toBlogPost(post: ApiBlogPost): BlogPost {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    categorySlug: post.categorySlug,
    publishedAt: post.publishedAt ?? '',
    coverImage: coverImageFor(post.mediaImages),
    imageAlt: post.title,
    author: post.author,
    readMinutes: post.readMinutes,
    tags: post.tags,
    body: post.body,
  };
}

// Facet caches — derived from whichever page of posts was most recently fetched by `queryPosts`/
// `getPost` (see this module's own doc comment on why: no dedicated facet endpoint exists).
let lastCategories: BlogCategory[] = [];
let lastAuthors: string[] = [];
let lastTags: string[] = [];

function updateFacets(posts: BlogPost[]) {
  const categoryMap = new Map<string, BlogCategory>();
  for (const p of posts) {
    if (!categoryMap.has(p.categorySlug)) {
      categoryMap.set(p.categorySlug, { id: p.categorySlug, slug: p.categorySlug, name: humanizeSlug(p.categorySlug) });
    }
  }
  lastCategories = [...categoryMap.values()];
  lastAuthors = [...new Set(posts.map((p) => p.author))].sort();
  lastTags = [...new Set(posts.flatMap((p) => p.tags))].sort();
}

/**
 * GET /catalog/blog-posts?... — filter, sort, paginate. `search` and a single `categories[0]`
 * forward to the server; everything else (`sort`, `reading`, multi-category, `authors`, `tags`)
 * narrows the returned page client-side (see this module's doc comment). Pure signature swap
 * from the old static version, now `async`.
 */
export async function queryPosts(q: BlogQuery = {}): Promise<Paginated<BlogPost>> {
  const {
    search = '',
    sort = 'newest',
    categories = [],
    reading = 'any',
    authors = [],
    tags = [],
    page = 1,
    pageSize = PAGE_SIZE,
  } = q;

  const params = new URLSearchParams();
  if (search.trim()) params.set('search', search.trim());
  if (categories.length === 1) params.set('categorySlug', categories[0]);
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));

  const { data, meta } = await apiGet<ApiBlogPost[]>(`/catalog/blog-posts?${params.toString()}`, null);
  let items = data.map(toBlogPost);
  updateFacets(items);

  // Narrowing the server doesn't support — applied over this page's items only (see doc
  // comment). When any of these are active, `meta.total` (the server's search/category-only
  // count) would overstate what's actually shown, so fall back to this page's own count instead.
  const usesUnsupportedFilter = categories.length > 1 || authors.length > 0 || tags.length > 0 || reading !== 'any';
  items = items.filter((p) => {
    if (categories.length > 1 && !categories.includes(p.categorySlug)) return false;
    if (authors.length && !authors.includes(p.author)) return false;
    if (tags.length && !p.tags.some((t) => tags.includes(t))) return false;
    if (reading === 'short' && p.readMinutes > 4) return false;
    if (reading === 'long' && p.readMinutes < 5) return false;
    return true;
  });
  items.sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title);
    const byDate = a.publishedAt.localeCompare(b.publishedAt);
    return sort === 'oldest' ? byDate : -byDate;
  });

  return {
    items,
    total: usesUnsupportedFilter ? items.length : (meta?.total ?? items.length),
    page,
    pageSize,
  };
}

/** Facet option lists, derived from whichever page of posts was most recently fetched (see this
 *  module's doc comment) — call after `queryPosts`/`getPost` resolves, not before. */
export function categoryList(): BlogCategory[] {
  return [...lastCategories];
}
export function authorList(): string[] {
  return [...lastAuthors];
}
export function tagList(): string[] {
  return [...lastTags];
}

/** GET /catalog/blog-posts/:slug — returns `null` (not a thrown error) for an unpublished or
 *  nonexistent slug, since the public endpoint's 404 is an expected, normal outcome for this
 *  call site (an invalid/old URL), not a real error to surface. */
export async function getPost(slug: string): Promise<BlogPost | null> {
  try {
    const { data } = await apiGet<ApiBlogPost>(`/catalog/blog-posts/${encodeURIComponent(slug)}`, null);
    const post = toBlogPost(data);
    updateFacets([post]);
    return post;
  } catch (err) {
    if (err instanceof ApiRequestError && err.code === 'NOT_FOUND') return null;
    throw err;
  }
}

/** Resolve a category slug to its display name (falls back to a Title Case rendering of the
 *  slug itself — see `humanizeSlug`'s doc comment for why there is no real display name to read
 *  from the backend). */
export function categoryName(slug: string): string {
  return lastCategories.find((c) => c.slug === slug)?.name ?? humanizeSlug(slug);
}

/** Locale-aware date formatting — one source of truth for both blog pages. Unchanged by this
 *  swap (pure function, no data dependency). */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
