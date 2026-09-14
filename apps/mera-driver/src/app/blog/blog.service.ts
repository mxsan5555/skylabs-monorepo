import { Injectable } from '@angular/core';
import type {
  BlogCategory,
  BlogPost,
  BlogQuery,
  Paginated,
} from '../models';
import blogDefaults from '../../../public/data/blog.json';

/**
 * Blog data + access for mera-driver.
 *
 * Static content loaded from blog.json; the methods mirror the future API (`listPosts` →
 * `GET /posts?page`, `getPost` → `GET /posts/:slug`), so swapping to HttpClient
 * is a one-file change — components never read the raw array.
 */
@Injectable({ providedIn: 'root' })
export class BlogService {
  readonly pageSize = 4;

  private readonly categories: BlogCategory[] = blogDefaults.categories as BlogCategory[];
  private readonly posts: BlogPost[] = blogDefaults.posts as BlogPost[];

  total(): number {
    return this.posts.length;
  }

  /**
   * GET /posts?... — filter, sort, paginate. One source of truth for the list
   * grid and its pagination. Pure over the static array; becomes the API call.
   */
  queryPosts(q: BlogQuery = {}): Paginated<BlogPost> {
    const {
      search = '',
      sort = 'newest',
      categories = [],
      reading = 'any',
      authors = [],
      tags = [],
      page = 1,
      pageSize = this.pageSize,
    } = q;
    const term = search.trim().toLowerCase();

    const filtered = this.posts.filter((p) => {
      if (term && !`${p.title} ${p.excerpt}`.toLowerCase().includes(term))
        return false;
      if (categories.length && !categories.includes(p.categorySlug)) return false;
      if (authors.length && !authors.includes(p.author)) return false;
      if (tags.length && !p.tags.some((t) => tags.includes(t))) return false;
      if (reading === 'short' && p.readMinutes > 4) return false;
      if (reading === 'long' && p.readMinutes < 5) return false;
      return true;
    });

    filtered.sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title);
      const byDate = a.publishedAt.localeCompare(b.publishedAt);
      return sort === 'oldest' ? byDate : -byDate;
    });

    const start = (page - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize,
    };
  }

  /** Facet option lists, derived from the data (no hardcoded lists). */
  categoryList(): BlogCategory[] {
    return [...this.categories];
  }
  authorList(): string[] {
    return [...new Set(this.posts.map((p) => p.author))].sort();
  }
  tagList(): string[] {
    return [...new Set(this.posts.flatMap((p) => p.tags))].sort();
  }

  /** GET /posts/:slug */
  getPost(slug: string): BlogPost | undefined {
    return this.posts.find((p) => p.slug === slug);
  }

  /** Resolve a category slug to its display name (falls back to the slug). */
  categoryName(slug: string): string {
    return this.categories.find((c) => c.slug === slug)?.name ?? slug;
  }
}
