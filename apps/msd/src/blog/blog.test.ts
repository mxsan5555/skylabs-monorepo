import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queryPosts, getPost } from './blog';
import { ApiRequestError } from '../api/rbac/client';

const apiGetMock = vi.fn();

vi.mock('../api/rbac/client', async () => {
  const actual = await vi.importActual<typeof import('../api/rbac/client')>('../api/rbac/client');
  return {
    ...actual,
    apiGet: (...args: unknown[]) => apiGetMock(...args),
  };
});

const publishedApiPost = {
  id: 'post-1',
  title: 'Deep Tissue Massage Benefits',
  slug: 'deep-tissue-massage-benefits',
  excerpt: 'Everything you need to know.',
  categorySlug: 'wellness',
  body: [{ type: 'paragraph', text: 'Hello world' }],
  author: 'Jane Doe',
  readMinutes: 4,
  tags: ['wellness'],
  publishedAt: '2025-01-01T00:00:00.000Z',
  metaTitle: null,
  metaDescription: null,
  mediaImages: [
    { id: 'img-2', storageKey: 'blog-posts/post-1/secondary.jpg', isPrimary: false, sortOrder: 1 },
    { id: 'img-1', storageKey: 'blog-posts/post-1/primary.jpg', isPrimary: true, sortOrder: 0 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('queryPosts', () => {
  it('calls GET /catalog/blog-posts with no auth token and maps the response into the frontend BlogPost shape', async () => {
    apiGetMock.mockResolvedValue({ data: [publishedApiPost], meta: { total: 1 } });
    const result = await queryPosts();
    expect(apiGetMock).toHaveBeenCalledWith(expect.stringContaining('/catalog/blog-posts?'), null);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'post-1',
        slug: 'deep-tissue-massage-benefits',
        title: 'Deep Tissue Massage Benefits',
        publishedAt: '2025-01-01T00:00:00.000Z',
        imageAlt: 'Deep Tissue Massage Benefits',
      }),
    );
  });

  it('resolves coverImage from the primary mediaImage, not just the first array element', async () => {
    apiGetMock.mockResolvedValue({ data: [publishedApiPost], meta: { total: 1 } });
    const result = await queryPosts();
    // publishedApiPost's array order puts the non-primary image first — the primary one
    // (sortOrder 0, isPrimary true) must still win.
    expect(result.items[0].coverImage).toContain('blog-posts/post-1/primary.jpg');
  });

  it('falls back to the lowest-sortOrder image when no image is flagged primary', async () => {
    const noPrimary = {
      ...publishedApiPost,
      mediaImages: [
        { id: 'img-2', storageKey: 'blog-posts/post-1/second.jpg', isPrimary: false, sortOrder: 1 },
        { id: 'img-1', storageKey: 'blog-posts/post-1/first.jpg', isPrimary: false, sortOrder: 0 },
      ],
    };
    apiGetMock.mockResolvedValue({ data: [noPrimary], meta: { total: 1 } });
    const result = await queryPosts();
    expect(result.items[0].coverImage).toContain('blog-posts/post-1/first.jpg');
  });

  it('coverImage is an empty string when no images have been uploaded yet (empty state)', async () => {
    apiGetMock.mockResolvedValue({ data: [{ ...publishedApiPost, mediaImages: [] }], meta: { total: 1 } });
    const result = await queryPosts();
    expect(result.items[0].coverImage).toBe('');
  });

  it('imageAlt always falls back to the post title (no dedicated alt-text column)', async () => {
    apiGetMock.mockResolvedValue({ data: [publishedApiPost], meta: { total: 1 } });
    const result = await queryPosts();
    expect(result.items[0].imageAlt).toBe(publishedApiPost.title);
  });

  it('forwards search and a single category to the server as query params', async () => {
    apiGetMock.mockResolvedValue({ data: [], meta: { total: 0 } });
    await queryPosts({ search: 'tissue', categories: ['wellness'], page: 2, pageSize: 8 });
    const [path] = apiGetMock.mock.calls[0];
    expect(path).toContain('search=tissue');
    expect(path).toContain('categorySlug=wellness');
    expect(path).toContain('page=2');
    expect(path).toContain('pageSize=8');
  });

  it('returns an empty items array with correct pagination shape when nothing matches (empty state)', async () => {
    apiGetMock.mockResolvedValue({ data: [], meta: { total: 0 } });
    const result = await queryPosts();
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('propagates a non-404 API error rather than swallowing it (error state)', async () => {
    apiGetMock.mockRejectedValue(new ApiRequestError('SERVER_ERROR', 'boom', 500));
    await expect(queryPosts()).rejects.toThrow('boom');
  });
});

describe('getPost', () => {
  it('calls GET /catalog/blog-posts/:slug with no auth token and maps the response', async () => {
    apiGetMock.mockResolvedValue({ data: publishedApiPost });
    const result = await getPost('deep-tissue-massage-benefits');
    expect(apiGetMock).toHaveBeenCalledWith('/catalog/blog-posts/deep-tissue-massage-benefits', null);
    expect(result).toEqual(
      expect.objectContaining({ id: 'post-1', slug: 'deep-tissue-massage-benefits', coverImage: expect.stringContaining('primary.jpg') }),
    );
  });

  it('returns null (not a thrown error) for a NOT_FOUND slug — draft or nonexistent (empty/edge state)', async () => {
    apiGetMock.mockRejectedValue(new ApiRequestError('NOT_FOUND', 'Blog post not found', 404));
    const result = await getPost('still-a-draft-or-missing');
    expect(result).toBeNull();
  });

  it('re-throws a non-NOT_FOUND error instead of masking it as null (error state)', async () => {
    apiGetMock.mockRejectedValue(new ApiRequestError('SERVER_ERROR', 'boom', 500));
    await expect(getPost('deep-tissue-massage-benefits')).rejects.toThrow('boom');
  });
});
