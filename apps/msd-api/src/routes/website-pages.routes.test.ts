import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

vi.mock('../services/permission-resolver.service', () => ({
  resolveGrantedPermissionKeys: vi.fn(),
}));

import app from '../app';
import { prisma } from '../lib/prisma';
import { resolveGrantedPermissionKeys } from '../services/permission-resolver.service';
import { bearerFor } from '../test-utils/auth-test-utils';

const resolveMock = vi.mocked(resolveGrantedPermissionKeys);
const prismaMock = vi.mocked(prisma, true);

const PAGE_ID = 'd0d0d0d0-0000-4000-8000-000000000001';

const pageFixture = {
  id: PAGE_ID,
  slug: 'privacy-policy',
  title: 'Privacy Policy',
  content: [{ type: 'paragraph', text: 'We respect your privacy.' }],
  status: 'DRAFT',
  metaTitle: null,
  metaDescription: null,
};

function authHeader(roles: string[] = ['admin']) {
  return bearerFor({ sub: 'admin-1', roles });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe('GET /api/v1/website-pages', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/website-pages');
    expect(res.status).toBe(401);
  });

  it('returns 403 without cms.website-pages:view', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).get('/api/v1/website-pages').set('Authorization', authHeader());
    expect(res.status).toBe(403);
  });

  it('returns 200 with the fixed set of legal pages', async () => {
    resolveMock.mockResolvedValue(['cms.website-pages:view']);
    prismaMock.websitePage.findMany.mockResolvedValue([
      pageFixture,
      { ...pageFixture, id: 'e0e0e0e0-0000-4000-8000-000000000002', slug: 'terms-of-service', title: 'Terms of Service' },
    ]);
    prismaMock.websitePage.count.mockResolvedValue(2);
    const res = await request(app).get('/api/v1/website-pages').set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toEqual(expect.objectContaining({ total: 2 }));
  });

  it('filters by search (title contains, case-insensitive)', async () => {
    resolveMock.mockResolvedValue(['cms.website-pages:view']);
    prismaMock.websitePage.findMany.mockResolvedValue([]);
    prismaMock.websitePage.count.mockResolvedValue(0);
    await request(app).get('/api/v1/website-pages?search=privacy').set('Authorization', authHeader());
    expect(prismaMock.websitePage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ title: { contains: 'privacy', mode: 'insensitive' } }) }),
    );
  });

  it('never registers a create route — POST is not a valid method on this resource', async () => {
    resolveMock.mockResolvedValue(['cms.website-pages:create']);
    const res = await request(app).post('/api/v1/website-pages').set('Authorization', authHeader()).send({ title: 'New Page' });
    // Express falls through to notFoundHandler for an unmatched method+path combination.
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/website-pages/:id', () => {
  it('returns 403 without cms.website-pages:view', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).get(`/api/v1/website-pages/${PAGE_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(403);
  });

  it('returns the page', async () => {
    resolveMock.mockResolvedValue(['cms.website-pages:view']);
    prismaMock.websitePage.findUnique.mockResolvedValue(pageFixture);
    const res = await request(app).get(`/api/v1/website-pages/${PAGE_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe('privacy-policy');
  });

  it('returns 404 when the page does not exist', async () => {
    resolveMock.mockResolvedValue(['cms.website-pages:view']);
    prismaMock.websitePage.findUnique.mockResolvedValue(null);
    const res = await request(app).get(`/api/v1/website-pages/${PAGE_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/website-pages/:id', () => {
  it('returns 403 without cms.website-pages:edit', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .patch(`/api/v1/website-pages/${PAGE_ID}`)
      .set('Authorization', authHeader())
      .send({ title: 'New Title' });
    expect(res.status).toBe(403);
  });

  it('updates the page content/title', async () => {
    resolveMock.mockResolvedValue(['cms.website-pages:edit']);
    prismaMock.websitePage.findUnique.mockResolvedValue(pageFixture);
    prismaMock.websitePage.update.mockResolvedValue({ ...pageFixture, title: 'New Title' });
    const res = await request(app)
      .patch(`/api/v1/website-pages/${PAGE_ID}`)
      .set('Authorization', authHeader())
      .send({ title: 'New Title' });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('New Title');
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('publishes the page via the status field on the plain PATCH route — no separate /status route for this resource', async () => {
    resolveMock.mockResolvedValue(['cms.website-pages:edit']);
    prismaMock.websitePage.findUnique.mockResolvedValue(pageFixture);
    prismaMock.websitePage.update.mockResolvedValue({ ...pageFixture, status: 'PUBLISHED' });
    const res = await request(app)
      .patch(`/api/v1/website-pages/${PAGE_ID}`)
      .set('Authorization', authHeader())
      .send({ status: 'PUBLISHED' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PUBLISHED');
  });

  it('returns 422 for an invalid status value', async () => {
    resolveMock.mockResolvedValue(['cms.website-pages:edit']);
    const res = await request(app)
      .patch(`/api/v1/website-pages/${PAGE_ID}`)
      .set('Authorization', authHeader())
      .send({ status: 'ARCHIVED' });
    expect(res.status).toBe(422);
    expect(prismaMock.websitePage.update).not.toHaveBeenCalled();
  });

  it('404s when the page does not exist', async () => {
    resolveMock.mockResolvedValue(['cms.website-pages:edit']);
    prismaMock.websitePage.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .patch(`/api/v1/website-pages/${PAGE_ID}`)
      .set('Authorization', authHeader())
      .send({ title: 'New Title' });
    expect(res.status).toBe(404);
    expect(prismaMock.websitePage.update).not.toHaveBeenCalled();
  });

  it('never registers a delete route — DELETE is not a valid method on this resource', async () => {
    resolveMock.mockResolvedValue(['cms.website-pages:delete']);
    const res = await request(app).delete(`/api/v1/website-pages/${PAGE_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(404);
  });
});
