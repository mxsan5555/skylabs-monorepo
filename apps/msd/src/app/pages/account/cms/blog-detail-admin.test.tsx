import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlogDetailAdmin } from './blog-detail-admin';

const mocks = vi.hoisted(() => ({ pages: vi.fn(), articles: vi.fn() }));
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => ({ token: 'test' }) }));
vi.mock('../../../../api/rbac/blog-posts', () => ({ getBlogPost: mocks.pages, blogArticlesApi: { getBlogPost: mocks.articles } }));
const id = 'f0f0f0f0-0000-4000-8000-000000000010';
const post = { id, title: 'Article detail', status: 'DRAFT', author: 'Author', readMinutes: 1, body: [], tags: [] };
function renderDetail(path: string, scope: 'pages' | 'articles') {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/preview" element={<BlogDetailAdmin scope={scope} />} />
    <Route path="/preview/:id" element={<BlogDetailAdmin scope={scope} />} />
  </Routes></MemoryRouter>);
}
beforeEach(() => { vi.clearAllMocks(); });
describe.each(['pages', 'articles'] as const)('Blog detail %s', (scope) => {
  it.each(['/preview', '/preview/articles', '/preview/not-a-uuid'])('validates %s without an API lookup', async (path) => {
    renderDetail(path, scope);
    expect(await screen.findByRole('alert')).toHaveTextContent('Blog post not found.');
    expect(mocks.pages).not.toHaveBeenCalled();
    expect(mocks.articles).not.toHaveBeenCalled();
  });
  it('loads the selected UUID through the correct permission surface and preserves Back', async () => {
    const selected = scope === 'articles' ? mocks.articles : mocks.pages;
    selected.mockResolvedValue({ data: post });
    renderDetail(`/preview/${id}`, scope);
    expect(await screen.findByRole('heading', { name: post.title })).toBeTruthy();
    expect(selected).toHaveBeenCalledWith('test', id);
    expect(screen.getByRole('link').getAttribute('href')).toBe(scope === 'articles' ? '/account/cms/blog/articles' : '/account/cms/blog');
    expect((scope === 'articles' ? mocks.pages : mocks.articles)).not.toHaveBeenCalled();
  });
  it('keeps Not Found for a nonexistent valid identifier', async () => {
    (scope === 'articles' ? mocks.articles : mocks.pages).mockRejectedValue(new Error('not found'));
    renderDetail(`/preview/${id}`, scope);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: post.title })).toBeNull();
  });
});
