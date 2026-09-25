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

function authHeader(roles: string[] = ['admin']) {
  return bearerFor({ sub: 'admin-1', roles });
}

function validJpeg(): Buffer {
  const buffer = Buffer.alloc(50 * 1024, 0);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  return buffer;
}

const defaultAboutUs = {
  id: 'singleton',
  heroTitle: '',
  heroSubtitle: '',
  missionStatement: '',
  body: [],
  metaTitle: null,
  metaDescription: null,
  updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  mediaImages: [],
};

const defaultContactUs = {
  id: 'singleton',
  address: '',
  phone: '',
  email: '',
  mapEmbedUrl: '',
  socialLinks: [],
  metaTitle: null,
  metaDescription: null,
  updatedAt: new Date('2025-01-01T00:00:00.000Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe('GET /api/v1/about-us', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/about-us');
    expect(res.status).toBe(401);
  });

  it('returns 403 without cms.about-us:view', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).get('/api/v1/about-us').set('Authorization', authHeader());
    expect(res.status).toBe(403);
  });

  it('find-or-creates the singleton row and returns its (empty) defaults when no save has happened yet', async () => {
    resolveMock.mockResolvedValue(['cms.about-us:view']);
    prismaMock.aboutUsContent.findUnique.mockResolvedValue(null);
    prismaMock.aboutUsContent.create.mockResolvedValue(defaultAboutUs);
    const res = await request(app).get('/api/v1/about-us').set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(expect.objectContaining({ id: 'singleton', heroTitle: '', body: [] }));
    expect(prismaMock.aboutUsContent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { id: 'singleton' } }),
    );
  });

  it('returns the existing row without writing when one already exists (a plain GET never mutates)', async () => {
    resolveMock.mockResolvedValue(['cms.about-us:view']);
    const saved = { ...defaultAboutUs, heroTitle: 'Who we are' };
    prismaMock.aboutUsContent.findUnique.mockResolvedValue(saved);
    const res = await request(app).get('/api/v1/about-us').set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.heroTitle).toBe('Who we are');
    expect(prismaMock.aboutUsContent.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/about-us', () => {
  it('returns 403 without cms.about-us:edit', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).patch('/api/v1/about-us').set('Authorization', authHeader()).send({ heroTitle: 'Who we are' });
    expect(res.status).toBe(403);
  });

  it('creates/updates the singleton row via upsert against the fixed id and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['cms.about-us:edit']);
    prismaMock.aboutUsContent.upsert.mockResolvedValue({ ...defaultAboutUs, heroTitle: 'Who we are' });
    const res = await request(app).patch('/api/v1/about-us').set('Authorization', authHeader()).send({ heroTitle: 'Who we are' });
    expect(res.status).toBe(200);
    expect(res.body.data.heroTitle).toBe('Who we are');
    expect(prismaMock.aboutUsContent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'singleton' }, create: expect.objectContaining({ id: 'singleton' }) }),
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('re-PATCHing (idempotent) always targets the same singleton row, never creating a second one', async () => {
    resolveMock.mockResolvedValue(['cms.about-us:edit']);
    prismaMock.aboutUsContent.upsert.mockResolvedValue({ ...defaultAboutUs, heroTitle: 'Who we are' });
    await request(app).patch('/api/v1/about-us').set('Authorization', authHeader()).send({ heroTitle: 'Who we are' });
    await request(app).patch('/api/v1/about-us').set('Authorization', authHeader()).send({ heroTitle: 'Who we are' });
    expect(prismaMock.aboutUsContent.upsert).toHaveBeenCalledTimes(2);
    for (const call of prismaMock.aboutUsContent.upsert.mock.calls) {
      expect(call[0].where).toEqual({ id: 'singleton' });
    }
  });

  it('rejects an invalid metaDescription that exceeds the max length with a 422', async () => {
    resolveMock.mockResolvedValue(['cms.about-us:edit']);
    const res = await request(app)
      .patch('/api/v1/about-us')
      .set('Authorization', authHeader())
      .send({ metaDescription: 'x'.repeat(301) });
    expect(res.status).toBe(422);
    expect(prismaMock.aboutUsContent.upsert).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/about-us/images', () => {
  it('returns 403 without cms.about-us:edit', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .post('/api/v1/about-us/images')
      .set('Authorization', authHeader())
      .attach('file', validJpeg(), 'photo.jpg');
    expect(res.status).toBe(403);
  });

  it('uploads an image against the singleton row and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['cms.about-us:edit']);
    prismaMock.aboutUsContent.findUnique.mockResolvedValue(defaultAboutUs);
    prismaMock.aboutUsImage.count.mockResolvedValue(0);
    prismaMock.aboutUsImage.create.mockResolvedValue({ id: 'img-1' });
    const res = await request(app)
      .post('/api/v1/about-us/images')
      .set('Authorization', authHeader())
      .attach('file', validJpeg(), 'photo.jpg');
    expect(res.status).toBe(201);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });
});

describe('GET /api/v1/contact-us', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/contact-us');
    expect(res.status).toBe(401);
  });

  it('returns 403 without cms.contact-us:view', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).get('/api/v1/contact-us').set('Authorization', authHeader());
    expect(res.status).toBe(403);
  });

  it('find-or-creates the singleton row and returns its (empty) defaults when no save has happened yet', async () => {
    resolveMock.mockResolvedValue(['cms.contact-us:view']);
    prismaMock.contactUsContent.findUnique.mockResolvedValue(null);
    prismaMock.contactUsContent.create.mockResolvedValue(defaultContactUs);
    const res = await request(app).get('/api/v1/contact-us').set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(expect.objectContaining({ id: 'singleton', address: '', email: '' }));
    expect(prismaMock.contactUsContent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { id: 'singleton' } }),
    );
  });

  it('returns the existing row without writing when one already exists', async () => {
    resolveMock.mockResolvedValue(['cms.contact-us:view']);
    const saved = { ...defaultContactUs, email: 'hello@skylabs.dev' };
    prismaMock.contactUsContent.findUnique.mockResolvedValue(saved);
    const res = await request(app).get('/api/v1/contact-us').set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('hello@skylabs.dev');
    expect(prismaMock.contactUsContent.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/contact-us', () => {
  it('returns 403 without cms.contact-us:edit', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).patch('/api/v1/contact-us').set('Authorization', authHeader()).send({ email: 'hello@skylabs.dev' });
    expect(res.status).toBe(403);
  });

  it('creates/updates the singleton row via upsert against the fixed id and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['cms.contact-us:edit']);
    prismaMock.contactUsContent.upsert.mockResolvedValue({ ...defaultContactUs, email: 'hello@skylabs.dev' });
    const res = await request(app).patch('/api/v1/contact-us').set('Authorization', authHeader()).send({ email: 'hello@skylabs.dev' });
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('hello@skylabs.dev');
    expect(prismaMock.contactUsContent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'singleton' }, create: expect.objectContaining({ id: 'singleton' }) }),
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('re-PATCHing (idempotent) always targets the same singleton row, never creating a second one', async () => {
    resolveMock.mockResolvedValue(['cms.contact-us:edit']);
    prismaMock.contactUsContent.upsert.mockResolvedValue({ ...defaultContactUs, email: 'hello@skylabs.dev' });
    await request(app).patch('/api/v1/contact-us').set('Authorization', authHeader()).send({ email: 'hello@skylabs.dev' });
    await request(app).patch('/api/v1/contact-us').set('Authorization', authHeader()).send({ email: 'hello@skylabs.dev' });
    expect(prismaMock.contactUsContent.upsert).toHaveBeenCalledTimes(2);
    for (const call of prismaMock.contactUsContent.upsert.mock.calls) {
      expect(call[0].where).toEqual({ id: 'singleton' });
    }
  });

  it('rejects an invalid email with a 422', async () => {
    resolveMock.mockResolvedValue(['cms.contact-us:edit']);
    const res = await request(app).patch('/api/v1/contact-us').set('Authorization', authHeader()).send({ email: 'not-an-email' });
    expect(res.status).toBe(422);
    expect(prismaMock.contactUsContent.upsert).not.toHaveBeenCalled();
  });
});
