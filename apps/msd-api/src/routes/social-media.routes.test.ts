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

const LINK_ID = 'c1c1c1c1-0000-4000-8000-000000000001';

const linkFixture = {
  id: LINK_ID,
  platform: 'instagram',
  displayName: 'Instagram',
  url: 'https://instagram.com/skylabs',
  sortOrder: 0,
  isActive: true,
};

const validCreatePayload = {
  platform: 'facebook',
  displayName: 'Facebook',
  url: 'https://facebook.com/skylabs',
  sortOrder: 1,
};

function authHeader(roles: string[] = ['admin']) {
  return bearerFor({ sub: 'admin-1', roles });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe('GET /api/v1/social-media', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/social-media');
    expect(res.status).toBe(401);
  });

  it('returns 403 without cms.social-media:view', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).get('/api/v1/social-media').set('Authorization', authHeader());
    expect(res.status).toBe(403);
  });

  it('returns 200 with the paginated list, including inactive rows (admin caller)', async () => {
    resolveMock.mockResolvedValue(['cms.social-media:view']);
    prismaMock.socialMediaLink.findMany.mockResolvedValue([{ ...linkFixture, isActive: false }]);
    prismaMock.socialMediaLink.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v1/social-media?page=1&pageSize=20').set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data[0].isActive).toBe(false);
  });

  it('filters by search (displayName contains, case-insensitive)', async () => {
    resolveMock.mockResolvedValue(['cms.social-media:view']);
    prismaMock.socialMediaLink.findMany.mockResolvedValue([]);
    prismaMock.socialMediaLink.count.mockResolvedValue(0);
    await request(app).get('/api/v1/social-media?search=insta').set('Authorization', authHeader());
    expect(prismaMock.socialMediaLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ displayName: { contains: 'insta', mode: 'insensitive' } }) }),
    );
  });
});

describe('POST /api/v1/social-media', () => {
  it('returns 403 without cms.social-media:create', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).post('/api/v1/social-media').set('Authorization', authHeader()).send(validCreatePayload);
    expect(res.status).toBe(403);
  });

  it('creates a social media link and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['cms.social-media:create']);
    prismaMock.socialMediaLink.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: LINK_ID, isActive: true, ...data }),
    );
    const res = await request(app).post('/api/v1/social-media').set('Authorization', authHeader()).send(validCreatePayload);
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(LINK_ID);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('returns 422 with fieldErrors when platform is missing', async () => {
    resolveMock.mockResolvedValue(['cms.social-media:create']);
    const { platform, ...withoutPlatform } = validCreatePayload;
    void platform;
    const res = await request(app).post('/api/v1/social-media').set('Authorization', authHeader()).send(withoutPlatform);
    expect(res.status).toBe(422);
    expect(res.body.error.details.fieldErrors.platform).toBeDefined();
    expect(prismaMock.socialMediaLink.create).not.toHaveBeenCalled();
  });

  it('returns 422 when url is not a valid URL', async () => {
    resolveMock.mockResolvedValue(['cms.social-media:create']);
    const res = await request(app)
      .post('/api/v1/social-media')
      .set('Authorization', authHeader())
      .send({ ...validCreatePayload, url: 'not-a-url' });
    expect(res.status).toBe(422);
    expect(prismaMock.socialMediaLink.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/social-media/:id', () => {
  it('returns the link', async () => {
    resolveMock.mockResolvedValue(['cms.social-media:view']);
    prismaMock.socialMediaLink.findUnique.mockResolvedValue(linkFixture);
    const res = await request(app).get(`/api/v1/social-media/${LINK_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(LINK_ID);
  });

  it('returns 404 when the link does not exist', async () => {
    resolveMock.mockResolvedValue(['cms.social-media:view']);
    prismaMock.socialMediaLink.findUnique.mockResolvedValue(null);
    const res = await request(app).get(`/api/v1/social-media/${LINK_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/social-media/:id', () => {
  it('returns 403 without cms.social-media:edit', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .patch(`/api/v1/social-media/${LINK_ID}`)
      .set('Authorization', authHeader())
      .send({ displayName: 'New Name' });
    expect(res.status).toBe(403);
  });

  it('updates the link', async () => {
    resolveMock.mockResolvedValue(['cms.social-media:edit']);
    prismaMock.socialMediaLink.findUnique.mockResolvedValue(linkFixture);
    prismaMock.socialMediaLink.update.mockResolvedValue({ ...linkFixture, displayName: 'New Name' });
    const res = await request(app)
      .patch(`/api/v1/social-media/${LINK_ID}`)
      .set('Authorization', authHeader())
      .send({ displayName: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.data.displayName).toBe('New Name');
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('toggles isActive (deactivate) via the plain PATCH route — no separate /status route for this resource', async () => {
    resolveMock.mockResolvedValue(['cms.social-media:edit']);
    prismaMock.socialMediaLink.findUnique.mockResolvedValue(linkFixture);
    prismaMock.socialMediaLink.update.mockResolvedValue({ ...linkFixture, isActive: false });
    const res = await request(app)
      .patch(`/api/v1/social-media/${LINK_ID}`)
      .set('Authorization', authHeader())
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it('404s when the link does not exist', async () => {
    resolveMock.mockResolvedValue(['cms.social-media:edit']);
    prismaMock.socialMediaLink.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .patch(`/api/v1/social-media/${LINK_ID}`)
      .set('Authorization', authHeader())
      .send({ displayName: 'New Name' });
    expect(res.status).toBe(404);
    expect(prismaMock.socialMediaLink.update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/social-media/:id', () => {
  it('returns 403 without cms.social-media:delete', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).delete(`/api/v1/social-media/${LINK_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(403);
  });

  it('deletes the link and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['cms.social-media:delete']);
    prismaMock.socialMediaLink.findUnique.mockResolvedValue(linkFixture);
    prismaMock.socialMediaLink.delete.mockResolvedValue(linkFixture);
    const res = await request(app).delete(`/api/v1/social-media/${LINK_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('returns 404 when the link does not exist', async () => {
    resolveMock.mockResolvedValue(['cms.social-media:delete']);
    prismaMock.socialMediaLink.findUnique.mockResolvedValue(null);
    const res = await request(app).delete(`/api/v1/social-media/${LINK_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(404);
    expect(prismaMock.socialMediaLink.delete).not.toHaveBeenCalled();
  });
});
