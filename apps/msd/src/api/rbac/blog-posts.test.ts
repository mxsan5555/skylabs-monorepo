import { describe, expect, it, vi } from 'vitest';
import * as api from './blog-posts';
import * as client from './client';
vi.mock('./client', () => ({ apiGet: vi.fn(), apiPost: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn() }));

describe.each(['pages', 'articles'] as const)('Blog client %s namespace', (scope) => {
  it('uses the matching resource for list, get, create, edit, status and delete', () => {
    const selected = scope === 'articles' ? api.blogArticlesApi : api;
    const resource = scope === 'articles' ? '/blog-articles' : '/blog-posts';
    const input: api.BlogPostInput = { title: 'Test', slug: 'test', excerpt: 'Test', categoryId: 'category', author: 'Test', body: [{ type: 'paragraph', text: 'Test' }], readMinutes: 1, tags: [] };
    selected.listBlogPosts('token', { page: 2, search: 'title' });
    expect(client.apiGet).toHaveBeenLastCalledWith(`${resource}?page=2&search=title`, 'token');
    selected.getBlogPost('token', 'selected-id');
    expect(client.apiGet).toHaveBeenLastCalledWith(`${resource}/selected-id`, 'token');
    selected.createBlogPost('token', input);
    expect(client.apiPost).toHaveBeenLastCalledWith(resource, 'token', input);
    selected.updateBlogPost('token', 'selected-id', input);
    expect(client.apiPatch).toHaveBeenLastCalledWith(`${resource}/selected-id`, 'token', input);
    selected.setBlogPostStatus('token', 'selected-id', 'PUBLISHED');
    expect(client.apiPatch).toHaveBeenLastCalledWith(`${resource}/selected-id/status`, 'token', { status: 'PUBLISHED' });
    selected.deleteBlogPost('token', 'selected-id');
    expect(client.apiDelete).toHaveBeenLastCalledWith(`${resource}/selected-id`, 'token');
  });
});
