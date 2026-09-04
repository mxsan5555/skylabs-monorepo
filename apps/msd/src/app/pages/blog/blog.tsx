import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Icon,
  OutlinedButton,
  FilledButton,
  FilledTonalButton,
  TextButton,
  OutlinedTextField,
  Radio,
  Checkbox,
} from '@skylabs-monorepo/shared-ui/react';
import type { BlogSort, ReadingBucket } from '../../../types';
import {
  queryPosts,
  categoryName,
  categoryList,
  authorList,
  tagList,
  formatDate,
  PAGE_SIZE,
} from '../../../blog/blog';
import './blog.css';

type Filters = {
  search: string;
  sort: BlogSort;
  categories: string[];
  reading: ReadingBucket;
  authors: string[];
  tags: string[];
};

const EMPTY: Filters = {
  search: '',
  sort: 'newest',
  categories: [],
  reading: 'any',
  authors: [],
  tags: [],
};

const SORT_OPTIONS: { value: BlogSort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'title', label: 'Title A–Z' },
];
const READING_OPTIONS: { value: ReadingBucket; label: string }[] = [
  { value: 'any', label: 'Any length' },
  { value: 'short', label: '4 min or less' },
  { value: 'long', label: '5 min or more' },
];

/** Toggle a value in/out of a multi-select array. */
const toggle = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

/**
 * Blog index: filter/sort sidebar + search + grid/list toggle + paginated cards.
 * All data flows through `queryPosts` (static now, API later); page is in `?page`.
 */
export function Blog() {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [params, setParams] = useSearchParams();

  const categories = categoryList();
  const authors = authorList();
  const tags = tagList();

  const total = queryPosts({ ...filters }).total;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(params.get('page')) || 1), totalPages);
  const { items } = queryPosts({ ...filters, page });
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  const activeCount =
    (filters.search ? 1 : 0) +
    (filters.sort !== 'newest' ? 1 : 0) +
    (filters.reading !== 'any' ? 1 : 0) +
    filters.categories.length +
    filters.authors.length +
    filters.tags.length;

  const resetPage = () => {
    if (params.get('page')) setParams({}, { replace: true });
  };
  const update = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    resetPage();
  };
  const clearAll = () => {
    setFilters(EMPTY);
    resetPage();
  };
  const goTo = (n: number) => setParams(n > 1 ? { page: String(n) } : {});

  function viewButton(mode: 'grid' | 'list', icon: string, label: string) {
    const active = view === mode;
    const Btn = active ? FilledTonalButton : OutlinedButton;
    return (
      <Btn aria-pressed={active} onClick={() => setView(mode)}>
        <Icon slot="icon" aria-hidden="true">{icon}</Icon>
        {label}
      </Btn>
    );
  }

  return (
    <main className="blog">
      <title>Blog · MSD</title>
      <meta
        name="description"
        content="Wellness tips, massage guides, and ways to get more from every session."
      />

      <h1 className="blog__h1">From the blog</h1>

      <div className="blog__layout">
        <aside className="blog__filters" aria-label="Filter and sort">
          <div className="blog__filters-head">
            <h2>Filter and sort</h2>
            {activeCount > 0 && (
              <TextButton onClick={clearAll}>Clear ({activeCount})</TextButton>
            )}
          </div>

          <sky-accordion>
            <sky-accordion-item header="Sort by" open>
              <div className="facet" role="radiogroup" aria-label="Sort by">
                {SORT_OPTIONS.map((o) => (
                  <label className="facet__opt" key={o.value}>
                    <Radio
                      name="sort"
                      value={o.value}
                      checked={filters.sort === o.value}
                      onChange={() => update({ sort: o.value })}
                    />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </sky-accordion-item>

            <sky-accordion-item header="Category" open>
              <div className="facet" role="group" aria-label="Category">
                {categories.map((c) => (
                  <label className="facet__opt" key={c.slug}>
                    <Checkbox
                      checked={filters.categories.includes(c.slug)}
                      onChange={() =>
                        update({ categories: toggle(filters.categories, c.slug) })
                      }
                    />
                    <span>{c.name}</span>
                  </label>
                ))}
              </div>
            </sky-accordion-item>

            <sky-accordion-item header="Reading time">
              <div className="facet" role="radiogroup" aria-label="Reading time">
                {READING_OPTIONS.map((o) => (
                  <label className="facet__opt" key={o.value}>
                    <Radio
                      name="reading"
                      value={o.value}
                      checked={filters.reading === o.value}
                      onChange={() => update({ reading: o.value })}
                    />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </sky-accordion-item>

            <sky-accordion-item header="Author">
              <div className="facet" role="group" aria-label="Author">
                {authors.map((a) => (
                  <label className="facet__opt" key={a}>
                    <Checkbox
                      checked={filters.authors.includes(a)}
                      onChange={() =>
                        update({ authors: toggle(filters.authors, a) })
                      }
                    />
                    <span>{a}</span>
                  </label>
                ))}
              </div>
            </sky-accordion-item>

            <sky-accordion-item header="Tag">
              <div className="facet" role="group" aria-label="Tag">
                {tags.map((t) => (
                  <label className="facet__opt" key={t}>
                    <Checkbox
                      checked={filters.tags.includes(t)}
                      onChange={() => update({ tags: toggle(filters.tags, t) })}
                    />
                    <span>{t}</span>
                  </label>
                ))}
              </div>
            </sky-accordion-item>
          </sky-accordion>
        </aside>

        <div className="blog__main">
          <div className="blog__toolbar">
            <form
              className="blog__search"
              role="search"
              onSubmit={(e) => e.preventDefault()}
            >
              <OutlinedTextField
                label="Search posts"
                value={filters.search}
                onInput={(e) =>
                  update({
                    search: (e.target as unknown as { value: string }).value,
                  })
                }
              >
                <Icon slot="leading-icon" aria-hidden="true">search</Icon>
              </OutlinedTextField>
            </form>
            <div className="view-toggle" role="group" aria-label="View">
              {viewButton('grid', 'grid_view', 'Grid')}
              {viewButton('list', 'view_list', 'List')}
            </div>
          </div>

          <p className="results__count" role="status" aria-live="polite">
            {total} {total === 1 ? 'article' : 'articles'}
          </p>

          {items.length === 0 ? (
            <p className="results__empty">
              No articles match your filters. Try clearing some.
            </p>
          ) : (
            <section aria-label="Articles">
              <ul className={`results results--${view}`}>
                {items.map((p) => (
                  <li key={p.id}>
                    <sky-card variant="outlined">
                      <article className="post-card">
                        <img
                          className="post-card__img"
                          src={p.coverImage}
                          alt={p.imageAlt}
                          width={800}
                          height={480}
                          loading="lazy"
                        />
                        <div className="post-card__body">
                          <p className="post-card__date">
                            <time dateTime={p.publishedAt}>
                              {formatDate(p.publishedAt)}
                            </time>
                          </p>
                          <h2 className="post-card__title">
                            <Link to={`/blog/${p.slug}`}>{p.title}</Link>
                          </h2>
                          {view === 'list' && (
                            <p className="post-card__excerpt">{p.excerpt}</p>
                          )}
                          <p className="post-card__cat">
                            <Icon aria-hidden="true">sell</Icon>
                            {categoryName(p.categorySlug)}
                          </p>
                        </div>
                      </article>
                    </sky-card>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {totalPages > 1 && (
            <nav className="pagination" aria-label="Blog pages">
              <OutlinedButton disabled={page <= 1} onClick={() => goTo(page - 1)}>
                <Icon slot="icon" aria-hidden="true">chevron_left</Icon>
                Previous
              </OutlinedButton>
              <ul className="pagination__pages">
                {pageNumbers.map((n) => (
                  <li key={n}>
                    {n === page ? (
                      <FilledButton aria-current="page" aria-label={`Page ${n}`}>
                        {n}
                      </FilledButton>
                    ) : (
                      <TextButton aria-label={`Page ${n}`} onClick={() => goTo(n)}>
                        {n}
                      </TextButton>
                    )}
                  </li>
                ))}
              </ul>
              <OutlinedButton
                disabled={page >= totalPages}
                onClick={() => goTo(page + 1)}
              >
                Next
                <Icon slot="icon" aria-hidden="true">chevron_right</Icon>
              </OutlinedButton>
            </nav>
          )}
        </div>
      </div>
    </main>
  );
}

export default Blog;
