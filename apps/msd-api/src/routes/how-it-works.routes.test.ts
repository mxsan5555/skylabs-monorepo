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

const STEP_ID = 'f1f1f1f1-0000-4000-8000-000000000001';
const STEP_ID_2 = 'f1f1f1f1-0000-4000-8000-000000000002';

const contentFixture = {
  id: 'singleton',
  heroTitle: 'How It Works',
  heroSubtitle: 'Book in three easy steps',
  metaTitle: null,
  metaDescription: null,
};

const stepFixture = {
  id: STEP_ID,
  title: 'Choose a Deal',
  description: 'Browse and pick the massage deal you want.',
  icon: 'search',
  sortOrder: 0,
  isActive: true,
};

const validStepPayload = {
  title: 'Book a Slot',
  description: 'Select your preferred date and time.',
  icon: 'event',
  sortOrder: 1,
};

function authHeader(roles: string[] = ['admin']) {
  return bearerFor({ sub: 'admin-1', roles });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe('GET /api/v1/how-it-works', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/how-it-works');
    expect(res.status).toBe(401);
  });

  it('returns 403 without cms.how-it-works:view', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).get('/api/v1/how-it-works').set('Authorization', authHeader());
    expect(res.status).toBe(403);
  });

  it('find-or-creates the singleton hero row when nothing has been saved yet', async () => {
    resolveMock.mockResolvedValue(['cms.how-it-works:view']);
    prismaMock.howItWorksContent.findUnique.mockResolvedValue(null);
    prismaMock.howItWorksContent.create.mockResolvedValue({ id: 'singleton', heroTitle: null, heroSubtitle: null, metaTitle: null, metaDescription: null });
    const res = await request(app).get('/api/v1/how-it-works').set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(prismaMock.howItWorksContent.create).toHaveBeenCalledOnce();
  });

  it('returns the existing hero row without writing', async () => {
    resolveMock.mockResolvedValue(['cms.how-it-works:view']);
    prismaMock.howItWorksContent.findUnique.mockResolvedValue(contentFixture);
    const res = await request(app).get('/api/v1/how-it-works').set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.heroTitle).toBe('How It Works');
    expect(prismaMock.howItWorksContent.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/how-it-works', () => {
  it('returns 403 without cms.how-it-works:edit', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).patch('/api/v1/how-it-works').set('Authorization', authHeader()).send({ heroTitle: 'New Title' });
    expect(res.status).toBe(403);
  });

  it('upserts the hero content and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['cms.how-it-works:edit']);
    prismaMock.howItWorksContent.upsert.mockResolvedValue({ ...contentFixture, heroTitle: 'New Title' });
    const res = await request(app).patch('/api/v1/how-it-works').set('Authorization', authHeader()).send({ heroTitle: 'New Title' });
    expect(res.status).toBe(200);
    expect(res.body.data.heroTitle).toBe('New Title');
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });
});

describe('GET /api/v1/how-it-works/steps', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/how-it-works/steps');
    expect(res.status).toBe(401);
  });

  it('returns 403 without cms.how-it-works:view', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).get('/api/v1/how-it-works/steps').set('Authorization', authHeader());
    expect(res.status).toBe(403);
  });

  it('returns steps ordered by sortOrder then createdAt, including inactive rows', async () => {
    resolveMock.mockResolvedValue(['cms.how-it-works:view']);
    prismaMock.howItWorksStep.findMany.mockResolvedValue([{ ...stepFixture, isActive: false }]);
    const res = await request(app).get('/api/v1/how-it-works/steps').set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data[0].isActive).toBe(false);
    expect(prismaMock.howItWorksStep.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    );
  });
});

describe('POST /api/v1/how-it-works/steps', () => {
  it('returns 403 without cms.how-it-works:create', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).post('/api/v1/how-it-works/steps').set('Authorization', authHeader()).send(validStepPayload);
    expect(res.status).toBe(403);
  });

  it('creates a step and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['cms.how-it-works:create']);
    prismaMock.howItWorksStep.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: STEP_ID_2, isActive: true, ...data }),
    );
    const res = await request(app).post('/api/v1/how-it-works/steps').set('Authorization', authHeader()).send(validStepPayload);
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(STEP_ID_2);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('returns 422 with fieldErrors when title is missing', async () => {
    resolveMock.mockResolvedValue(['cms.how-it-works:create']);
    const { title, ...withoutTitle } = validStepPayload;
    void title;
    const res = await request(app).post('/api/v1/how-it-works/steps').set('Authorization', authHeader()).send(withoutTitle);
    expect(res.status).toBe(422);
    expect(res.body.error.details.fieldErrors.title).toBeDefined();
    expect(prismaMock.howItWorksStep.create).not.toHaveBeenCalled();
  });

  it('returns 422 with fieldErrors when description is missing', async () => {
    resolveMock.mockResolvedValue(['cms.how-it-works:create']);
    const { description, ...withoutDescription } = validStepPayload;
    void description;
    const res = await request(app).post('/api/v1/how-it-works/steps').set('Authorization', authHeader()).send(withoutDescription);
    expect(res.status).toBe(422);
    expect(res.body.error.details.fieldErrors.description).toBeDefined();
    expect(prismaMock.howItWorksStep.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/how-it-works/steps/reorder', () => {
  it('returns 403 without cms.how-it-works:edit', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .patch('/api/v1/how-it-works/steps/reorder')
      .set('Authorization', authHeader())
      .send({ stepIds: [STEP_ID, STEP_ID_2] });
    expect(res.status).toBe(403);
  });

  it('reorders the steps in one transaction when the id set matches exactly', async () => {
    resolveMock.mockResolvedValue(['cms.how-it-works:edit']);
    prismaMock.howItWorksStep.findMany.mockResolvedValue([{ id: STEP_ID }, { id: STEP_ID_2 }]);
    prismaMock.howItWorksStep.update.mockResolvedValue({});
    const res = await request(app)
      .patch('/api/v1/how-it-works/steps/reorder')
      .set('Authorization', authHeader())
      .send({ stepIds: [STEP_ID_2, STEP_ID] });
    expect(res.status).toBe(200);
    expect(res.body.data.reordered).toBe(true);
    expect(prismaMock.howItWorksStep.update).toHaveBeenNthCalledWith(1, { where: { id: STEP_ID_2 }, data: { sortOrder: 0 } });
    expect(prismaMock.howItWorksStep.update).toHaveBeenNthCalledWith(2, { where: { id: STEP_ID }, data: { sortOrder: 1 } });
  });

  it('rejects a reorder list that omits one of the current steps', async () => {
    resolveMock.mockResolvedValue(['cms.how-it-works:edit']);
    prismaMock.howItWorksStep.findMany.mockResolvedValue([{ id: STEP_ID }, { id: STEP_ID_2 }]);
    const res = await request(app)
      .patch('/api/v1/how-it-works/steps/reorder')
      .set('Authorization', authHeader())
      .send({ stepIds: [STEP_ID] });
    expect(res.status).toBe(422);
    expect(prismaMock.howItWorksStep.update).not.toHaveBeenCalled();
  });

  it('rejects an empty stepIds array at the schema layer', async () => {
    resolveMock.mockResolvedValue(['cms.how-it-works:edit']);
    const res = await request(app).patch('/api/v1/how-it-works/steps/reorder').set('Authorization', authHeader()).send({ stepIds: [] });
    expect(res.status).toBe(422);
  });
});

describe('PATCH /api/v1/how-it-works/steps/:id', () => {
  it('returns 403 without cms.how-it-works:edit', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .patch(`/api/v1/how-it-works/steps/${STEP_ID}`)
      .set('Authorization', authHeader())
      .send({ title: 'New Title' });
    expect(res.status).toBe(403);
  });

  it('updates the step', async () => {
    resolveMock.mockResolvedValue(['cms.how-it-works:edit']);
    prismaMock.howItWorksStep.findUnique.mockResolvedValue(stepFixture);
    prismaMock.howItWorksStep.update.mockResolvedValue({ ...stepFixture, title: 'New Title' });
    const res = await request(app)
      .patch(`/api/v1/how-it-works/steps/${STEP_ID}`)
      .set('Authorization', authHeader())
      .send({ title: 'New Title' });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('New Title');
  });

  it('toggles isActive via the plain PATCH route — no separate /status route for this resource', async () => {
    resolveMock.mockResolvedValue(['cms.how-it-works:edit']);
    prismaMock.howItWorksStep.findUnique.mockResolvedValue(stepFixture);
    prismaMock.howItWorksStep.update.mockResolvedValue({ ...stepFixture, isActive: false });
    const res = await request(app)
      .patch(`/api/v1/how-it-works/steps/${STEP_ID}`)
      .set('Authorization', authHeader())
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it('404s when the step does not exist', async () => {
    resolveMock.mockResolvedValue(['cms.how-it-works:edit']);
    prismaMock.howItWorksStep.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .patch(`/api/v1/how-it-works/steps/${STEP_ID}`)
      .set('Authorization', authHeader())
      .send({ title: 'New Title' });
    expect(res.status).toBe(404);
    expect(prismaMock.howItWorksStep.update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/how-it-works/steps/:id', () => {
  it('returns 403 without cms.how-it-works:delete', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).delete(`/api/v1/how-it-works/steps/${STEP_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(403);
  });

  it('deletes the step and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['cms.how-it-works:delete']);
    prismaMock.howItWorksStep.findUnique.mockResolvedValue(stepFixture);
    prismaMock.howItWorksStep.delete.mockResolvedValue(stepFixture);
    const res = await request(app).delete(`/api/v1/how-it-works/steps/${STEP_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('returns 404 when the step does not exist', async () => {
    resolveMock.mockResolvedValue(['cms.how-it-works:delete']);
    prismaMock.howItWorksStep.findUnique.mockResolvedValue(null);
    const res = await request(app).delete(`/api/v1/how-it-works/steps/${STEP_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(404);
    expect(prismaMock.howItWorksStep.delete).not.toHaveBeenCalled();
  });
});
