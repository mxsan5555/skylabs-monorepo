import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

vi.mock('../services/permission-resolver.service', () => ({
  resolveGrantedPermissionKeys: vi.fn(),
}));

vi.mock('../lib/media-storage', () => ({
  writeMediaFile: vi.fn(async (subdir: string, parentId: string, buffer: Buffer) => ({
    storageKey: `${subdir}/${parentId}/fake.jpg`,
    sizeBytes: buffer.length,
  })),
  deleteMediaFile: vi.fn(async () => undefined),
}));

import app from '../app';
import { prisma } from '../lib/prisma';
import { resolveGrantedPermissionKeys } from '../services/permission-resolver.service';
import { bearerFor } from '../test-utils/auth-test-utils';

const resolveMock = vi.mocked(resolveGrantedPermissionKeys);
const prismaMock = vi.mocked(prisma, true);

const BLOG_ID = 'f0f0f0f0-0000-4000-8000-000000000010';
const CATEGORY_ID = 'c0c0c0c0-0000-4000-8000-000000000099';
const categoryFixture = { id: CATEGORY_ID, name: 'Wellness', slug: 'wellness' };

/** A byte-exact, magic-byte-valid JPEG buffer within the 30KB-80KB window — same helper
 *  convention as categories.routes.test.ts / media.routes.test.ts. */
function validJpeg(): Buffer {
  const buffer = Buffer.alloc(50 * 1024, 0);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  return buffer;
}

const blogPostFixture = {
  id: BLOG_ID,
  title: 'Deep Tissue Massage Benefits',
  slug: 'deep-tissue-massage-benefits',
  excerpt: 'Everything you need to know.',
  categoryId: CATEGORY_ID,
  category: categoryFixture,
  body: [{ type: 'paragraph', text: 'Hello world' }],
  author: 'Jane Doe',
  readMinutes: 4,
  tags: ['wellness'],
  status: 'DRAFT',
  publishedAt: null,
  metaTitle: null,
  metaDescription: null,
  mediaImages: [],
};

const validCreatePayload = {
  title: 'Deep Tissue Massage Benefits',
  slug: 'deep-tissue-massage-benefits',
  excerpt: 'Everything you need to know.',
  categoryId: CATEGORY_ID,
  body: [{ type: 'paragraph', text: 'Hello world' }],
  author: 'Jane Doe',
  readMinutes: 4,
  tags: ['wellness'],
};

function authHeader(roles: string[] = ['admin']) {
  return bearerFor({ sub: 'admin-1', roles });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe('GET /api/v1/blog-posts', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/blog-posts');
    expect(res.status).toBe(401);
  });

  it('returns 403 without cms.blog.pages:view', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).get('/api/v1/blog-posts').set('Authorization', authHeader());
    expect(res.status).toBe(403);
  });

  it('returns 200 with the paginated list', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:view']);
    prismaMock.blogPost.findMany.mockResolvedValue([blogPostFixture]);
    prismaMock.blogPost.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v1/blog-posts?page=2&pageSize=10').set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toEqual(expect.objectContaining({ total: 1, page: 2, pageSize: 10 }));
    expect(prismaMock.blogPost.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10 }));
  });

  it('filters by search (title contains, case-insensitive)', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:view']);
    prismaMock.blogPost.findMany.mockResolvedValue([]);
    prismaMock.blogPost.count.mockResolvedValue(0);
    await request(app).get('/api/v1/blog-posts?search=tissue').set('Authorization', authHeader());
    expect(prismaMock.blogPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ title: { contains: 'tissue', mode: 'insensitive' } }) }),
    );
  });

  it('filters by status', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:view']);
    prismaMock.blogPost.findMany.mockResolvedValue([]);
    prismaMock.blogPost.count.mockResolvedValue(0);
    await request(app).get('/api/v1/blog-posts?status=PUBLISHED').set('Authorization', authHeader());
    expect(prismaMock.blogPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PUBLISHED' }) }),
    );
  });

  it('filters by categoryId', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:view']);
    prismaMock.blogPost.findMany.mockResolvedValue([]);
    prismaMock.blogPost.count.mockResolvedValue(0);
    await request(app).get(`/api/v1/blog-posts?categoryId=${CATEGORY_ID}`).set('Authorization', authHeader());
    expect(prismaMock.blogPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ categoryId: CATEGORY_ID }) }),
    );
  });

  it('an admin caller may filter by DRAFT status (unlike the public catalog read)', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:view']);
    prismaMock.blogPost.findMany.mockResolvedValue([{ ...blogPostFixture, status: 'DRAFT' }]);
    prismaMock.blogPost.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v1/blog-posts?status=DRAFT').set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data[0].status).toBe('DRAFT');
  });
});

/**
 * Feature: categorySlug -> categoryId migration regression check
 * Scenario: verifying the BlogPost.categorySlug -> BlogPost.categoryId FK migration didn't
 * orphan any existing post (i.e. every post's categoryId still resolves to a real BlogCategory
 * row through the `category` relation the admin list/read now always `include`s).
 *
 * Given: the admin blog post list is read after the migration
 * When: the list is fetched
 * Then: the query always includes the `category` relation, and every returned post carries a
 * non-null, fully-populated category (never a dangling/orphaned categoryId with no matching row)
 *
 * Edge cases:
 * - a post whose category relation resolves to null (would indicate an orphaned FK) is
 *   distinguishable from a healthy row — this test asserts the happy path never produces one
 */
describe('Regression: BlogPost.categorySlug -> categoryId migration', () => {
  it('always includes the category relation on the admin list read', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:view']);
    prismaMock.blogPost.findMany.mockResolvedValue([blogPostFixture]);
    prismaMock.blogPost.count.mockResolvedValue(1);
    await request(app).get('/api/v1/blog-posts').set('Authorization', authHeader());
    expect(prismaMock.blogPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: expect.objectContaining({ category: true }) }),
    );
  });

  it('every post returned by the admin list resolves a real, non-null BlogCategory — no orphaned categoryId', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:view']);
    prismaMock.blogPost.findMany.mockResolvedValue([blogPostFixture, { ...blogPostFixture, id: 'another-post-id' }]);
    prismaMock.blogPost.count.mockResolvedValue(2);
    const res = await request(app).get('/api/v1/blog-posts').set('Authorization', authHeader());
    expect(res.status).toBe(200);
    for (const post of res.body.data) {
      expect(post.categoryId).toBeDefined();
      expect(post.category).toBeTruthy();
      expect(post.category.id).toBe(post.categoryId);
    }
  });

  it('the single-post read also includes the category relation, never a bare categoryId with no resolved row', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:view']);
    prismaMock.blogPost.findUnique.mockResolvedValue(blogPostFixture);
    const res = await request(app).get(`/api/v1/blog-posts/${BLOG_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.category).toBeTruthy();
    expect(prismaMock.blogPost.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ include: expect.objectContaining({ category: true }) }),
    );
  });
});

describe('POST /api/v1/blog-posts', () => {
  it('returns 403 without cms.blog.pages:create', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).post('/api/v1/blog-posts').set('Authorization', authHeader()).send(validCreatePayload);
    expect(res.status).toBe(403);
  });

  it('creates a blog post and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:create']);
    prismaMock.blogPost.findUnique.mockResolvedValue(null); // slug free
    prismaMock.blogPost.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: BLOG_ID, status: 'DRAFT', publishedAt: null, ...data }),
    );
    const res = await request(app).post('/api/v1/blog-posts').set('Authorization', authHeader()).send(validCreatePayload);
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(BLOG_ID);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('returns 422 with fieldErrors when title is missing', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:create']);
    const { title, ...withoutTitle } = validCreatePayload;
    void title;
    const res = await request(app).post('/api/v1/blog-posts').set('Authorization', authHeader()).send(withoutTitle);
    expect(res.status).toBe(422);
    expect(res.body.error.details.fieldErrors.title).toBeDefined();
    expect(prismaMock.blogPost.create).not.toHaveBeenCalled();
  });

  it('returns 422 with fieldErrors when body is an empty array', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:create']);
    const res = await request(app)
      .post('/api/v1/blog-posts')
      .set('Authorization', authHeader())
      .send({ ...validCreatePayload, body: [] });
    expect(res.status).toBe(422);
    expect(res.body.error.details.fieldErrors.body).toBeDefined();
    expect(prismaMock.blogPost.create).not.toHaveBeenCalled();
  });

  it('returns 422 for a malformed block inside body (missing text on a paragraph)', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:create']);
    const res = await request(app)
      .post('/api/v1/blog-posts')
      .set('Authorization', authHeader())
      .send({ ...validCreatePayload, body: [{ type: 'paragraph' }] });
    expect(res.status).toBe(422);
    expect(prismaMock.blogPost.create).not.toHaveBeenCalled();
  });

  it('returns 409 when the slug already exists', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:create']);
    prismaMock.blogPost.findUnique.mockResolvedValue(blogPostFixture);
    const res = await request(app).post('/api/v1/blog-posts').set('Authorization', authHeader()).send(validCreatePayload);
    expect(res.status).toBe(409);
    expect(prismaMock.blogPost.create).not.toHaveBeenCalled();
  });

  it('returns a clean 409 (not a raw 500) when a double-submit races past the app-layer slug check and hits the DB unique constraint', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:create']);
    prismaMock.blogPost.findUnique.mockResolvedValue(null);
    const { Prisma } = await import('../generated/prisma-client');
    prismaMock.blogPost.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );
    const res = await request(app).post('/api/v1/blog-posts').set('Authorization', authHeader()).send(validCreatePayload);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

describe('PATCH /api/v1/blog-posts/:id', () => {
  it('returns 403 without cms.blog.pages:edit', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .patch(`/api/v1/blog-posts/${BLOG_ID}`)
      .set('Authorization', authHeader())
      .send({ title: 'New Title' });
    expect(res.status).toBe(403);
  });

  it('updates the post', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:edit']);
    prismaMock.blogPost.findUnique.mockResolvedValue(blogPostFixture);
    prismaMock.blogPost.update.mockResolvedValue({ ...blogPostFixture, title: 'New Title' });
    const res = await request(app)
      .patch(`/api/v1/blog-posts/${BLOG_ID}`)
      .set('Authorization', authHeader())
      .send({ title: 'New Title' });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('New Title');
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('returns 409 when editing to a slug already used by another post', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:edit']);
    prismaMock.blogPost.findUnique
      .mockResolvedValueOnce(blogPostFixture) // getBlogPostOrThrow
      .mockResolvedValueOnce({ ...blogPostFixture, id: 'another-post-id' }); // assertSlugAvailable finds a different post
    const res = await request(app)
      .patch(`/api/v1/blog-posts/${BLOG_ID}`)
      .set('Authorization', authHeader())
      .send({ slug: 'taken-slug' });
    expect(res.status).toBe(409);
    expect(prismaMock.blogPost.update).not.toHaveBeenCalled();
  });

  it('allows keeping its own slug unchanged (excludeId matches)', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:edit']);
    prismaMock.blogPost.findUnique
      .mockResolvedValueOnce(blogPostFixture)
      .mockResolvedValueOnce(blogPostFixture); // same id -> not a conflict
    prismaMock.blogPost.update.mockResolvedValue(blogPostFixture);
    const res = await request(app)
      .patch(`/api/v1/blog-posts/${BLOG_ID}`)
      .set('Authorization', authHeader())
      .send({ slug: blogPostFixture.slug });
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/v1/blog-posts/:id/status', () => {
  it('returns 403 without cms.blog.pages:edit', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .patch(`/api/v1/blog-posts/${BLOG_ID}/status`)
      .set('Authorization', authHeader())
      .send({ status: 'PUBLISHED' });
    expect(res.status).toBe(403);
  });

  it('draft -> published sets publishedAt for the first time', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:edit']);
    prismaMock.blogPost.findUnique.mockResolvedValue({ ...blogPostFixture, status: 'DRAFT', publishedAt: null });
    prismaMock.blogPost.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...blogPostFixture, ...data }),
    );
    const res = await request(app)
      .patch(`/api/v1/blog-posts/${BLOG_ID}/status`)
      .set('Authorization', authHeader())
      .send({ status: 'PUBLISHED' });
    expect(res.status).toBe(200);
    const updateArgs = prismaMock.blogPost.update.mock.calls[0][0];
    expect(updateArgs.data.status).toBe('PUBLISHED');
    expect(updateArgs.data.publishedAt).toBeInstanceOf(Date);
  });

  it('a later published -> draft -> published round trip never overwrites the original publishedAt', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:edit']);
    const originalPublishedAt = new Date('2025-01-01T00:00:00.000Z');
    prismaMock.blogPost.findUnique.mockResolvedValue({ ...blogPostFixture, status: 'DRAFT', publishedAt: originalPublishedAt });
    prismaMock.blogPost.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...blogPostFixture, ...data }),
    );
    const res = await request(app)
      .patch(`/api/v1/blog-posts/${BLOG_ID}/status`)
      .set('Authorization', authHeader())
      .send({ status: 'PUBLISHED' });
    expect(res.status).toBe(200);
    const updateArgs = prismaMock.blogPost.update.mock.calls[0][0];
    expect(updateArgs.data.publishedAt).toBe(originalPublishedAt);
  });

  it('published -> draft leaves publishedAt untouched', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:edit']);
    const originalPublishedAt = new Date('2025-01-01T00:00:00.000Z');
    prismaMock.blogPost.findUnique.mockResolvedValue({ ...blogPostFixture, status: 'PUBLISHED', publishedAt: originalPublishedAt });
    prismaMock.blogPost.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...blogPostFixture, ...data }),
    );
    const res = await request(app)
      .patch(`/api/v1/blog-posts/${BLOG_ID}/status`)
      .set('Authorization', authHeader())
      .send({ status: 'DRAFT' });
    expect(res.status).toBe(200);
    const updateArgs = prismaMock.blogPost.update.mock.calls[0][0];
    expect(updateArgs.data.publishedAt).toBe(originalPublishedAt);
  });
});

describe('DELETE /api/v1/blog-posts/:id', () => {
  it('returns 403 without cms.blog.pages:delete', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).delete(`/api/v1/blog-posts/${BLOG_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(403);
  });

  it('deletes the post and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:delete']);
    prismaMock.blogPost.findUnique.mockResolvedValue(blogPostFixture);
    prismaMock.blogPost.delete.mockResolvedValue(blogPostFixture);
    const res = await request(app).delete(`/api/v1/blog-posts/${BLOG_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('returns 404 when the post does not exist', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:delete']);
    prismaMock.blogPost.findUnique.mockResolvedValue(null);
    const res = await request(app).delete(`/api/v1/blog-posts/${BLOG_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(404);
    expect(prismaMock.blogPost.delete).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/blog-posts/:id/images', () => {
  it('returns 403 without cms.blog.pages:edit', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .post(`/api/v1/blog-posts/${BLOG_ID}/images`)
      .set('Authorization', authHeader())
      .attach('file', validJpeg(), 'photo.jpg');
    expect(res.status).toBe(403);
  });

  it('uploads an image and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:edit']);
    prismaMock.blogPost.findUnique.mockResolvedValue(blogPostFixture);
    prismaMock.blogPostImage.count.mockResolvedValue(0);
    prismaMock.blogPostImage.create.mockResolvedValue({ id: 'img-1' });
    const res = await request(app)
      .post(`/api/v1/blog-posts/${BLOG_ID}/images`)
      .set('Authorization', authHeader())
      .attach('file', validJpeg(), 'photo.jpg');
    expect(res.status).toBe(201);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('404s when the blog post does not exist', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:edit']);
    prismaMock.blogPost.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post(`/api/v1/blog-posts/${BLOG_ID}/images`)
      .set('Authorization', authHeader())
      .attach('file', validJpeg(), 'photo.jpg');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/blog-posts/:id/images/:imageId', () => {
  it('returns 403 without cms.blog.pages:edit', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .delete(`/api/v1/blog-posts/${BLOG_ID}/images/img-1`)
      .set('Authorization', authHeader());
    expect(res.status).toBe(403);
  });

  it('deletes the image and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:edit']);
    prismaMock.blogPost.findUnique.mockResolvedValue(blogPostFixture);
    prismaMock.blogPostImage.findUnique.mockResolvedValue({ id: 'img-1', blogPostId: BLOG_ID, isPrimary: false, storageKey: 'blog-posts/x/img-1.jpg' });
    prismaMock.blogPostImage.delete.mockResolvedValue({ storageKey: 'blog-posts/x/img-1.jpg' });
    const res = await request(app)
      .delete(`/api/v1/blog-posts/${BLOG_ID}/images/img-1`)
      .set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });
});

describe('PATCH /api/v1/blog-posts/:id/images/:imageId/primary', () => {
  it('returns 403 without cms.blog.pages:edit', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .patch(`/api/v1/blog-posts/${BLOG_ID}/images/img-1/primary`)
      .set('Authorization', authHeader());
    expect(res.status).toBe(403);
  });

  it('sets the primary image', async () => {
    resolveMock.mockResolvedValue(['cms.blog.pages:edit']);
    prismaMock.blogPost.findUnique.mockResolvedValue(blogPostFixture);
    prismaMock.blogPostImage.findUnique.mockResolvedValue({ id: 'img-2', blogPostId: BLOG_ID, isPrimary: false, storageKey: 'y' });
    prismaMock.blogPostImage.updateMany.mockResolvedValue({});
    prismaMock.blogPostImage.update.mockResolvedValue({});
    const res = await request(app)
      .patch(`/api/v1/blog-posts/${BLOG_ID}/images/img-2/primary`)
      .set('Authorization', authHeader());
    expect(res.status).toBe(200);
  });
});
