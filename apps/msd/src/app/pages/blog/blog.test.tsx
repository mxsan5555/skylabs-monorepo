import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import content from '../../../content.json';
import { Blog, BlogCategory } from './blog';

const { listCategories, queryPosts } = vi.hoisted(() => ({
  listCategories: vi.fn(),
  queryPosts: vi.fn(),
}));

vi.mock('../../../api/catalog', () => ({
  listCatalogBlogCategories: () => listCategories(),
}));
vi.mock('../../../blog/blog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../blog/blog')>();
  return {
    ...actual,
    queryPosts: (q: unknown) => queryPosts(q),
    categoryName: (slug: string) => (slug === 'massage' ? 'Massage' : slug),
    authorList: () => [],
    tagList: () => [],
  };
});

const t = content.blog.category;
const post = {
  id: 'p1',
  slug: 'swedish-guide',
  title: 'A guide to Swedish massage',
  excerpt: 'What to expect.',
  coverImage: 'https://images.example/p1.jpg',
  imageAlt: 'Massage table',
  publishedAt: '2026-10-01T00:00:00.000Z',
  categorySlug: 'massage',
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/category/:slug" element={<BlogCategory />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  listCategories.mockResolvedValue({ data: [{ id: 'c1', name: 'Massage', slug: 'massage' }] });
  queryPosts.mockResolvedValue({ items: [post], total: 1 });
});

/** CO-02: `/blog/category/:slug` is the blog index locked to one category. */
describe('Blog category page', () => {
  it('lists only that category, with its own heading, title and description', async () => {
    renderAt('/blog/category/massage');
    expect(await screen.findByRole('heading', { level: 1, name: 'Massage articles' })).toBeTruthy();
    expect(queryPosts).toHaveBeenCalledWith(expect.objectContaining({ categories: ['massage'] }));
    await waitFor(() => expect(document.title).toBe('Massage articles · MSD'));
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      t.description.replace('{category}', 'Massage'),
    );
  });

  it('links back to all articles and leaves the fixed category out of the facets', async () => {
    renderAt('/blog/category/massage');
    await screen.findByText(post.title);
    expect(screen.getByRole('link', { name: t.allArticles }).getAttribute('href')).toBe('/blog');
    expect(screen.queryByRole('group', { name: 'Category' })).toBeNull();
  });

  it('shows the not-found page for an unknown category', async () => {
    renderAt('/blog/category/unknown');
    expect(await screen.findByRole('heading', { level: 1, name: content.notFound.title })).toBeTruthy();
  });

  it('still lists the category when the category list fails to load', async () => {
    listCategories.mockRejectedValue(new Error('offline'));
    renderAt('/blog/category/massage');
    expect(await screen.findByText(post.title)).toBeTruthy();
    expect(queryPosts).toHaveBeenCalledWith(expect.objectContaining({ categories: ['massage'] }));
  });
});

describe('Blog index', () => {
  it('links each card category to its category page', async () => {
    renderAt('/blog');
    await screen.findByText(post.title);
    expect(screen.getByRole('link', { name: 'Massage' }).getAttribute('href')).toBe('/blog/category/massage');
    expect(queryPosts).toHaveBeenCalledWith(expect.objectContaining({ categories: [] }));
  });
});
