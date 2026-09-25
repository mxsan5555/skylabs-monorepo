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

const JOB_ID = 'a1a1a1a1-0000-4000-8000-000000000001';

const contentFixture = {
  id: 'singleton',
  heroTitle: 'Careers',
  heroSubtitle: 'Join our team',
  metaTitle: null,
  metaDescription: null,
};

const jobFixture = {
  id: JOB_ID,
  jobTitle: 'Massage Therapist',
  department: 'Operations',
  location: 'Bengaluru',
  employmentType: 'Full-time',
  description: 'Provide massage services to customers.',
  responsibilities: 'Deliver excellent massage sessions.',
  requirements: 'Certified therapist with 2+ years experience.',
  applyUrl: 'https://example.com/apply',
  applyInstructions: null,
  sortOrder: 0,
  status: 'DRAFT',
};

const validJobPayload = {
  jobTitle: 'Front Desk Executive',
  department: 'Operations',
  location: 'Mumbai',
  employmentType: 'Full-time',
  description: 'Greet and assist walk-in customers.',
  responsibilities: 'Manage bookings and front desk operations.',
  requirements: 'Good communication skills.',
};

function authHeader(roles: string[] = ['admin']) {
  return bearerFor({ sub: 'admin-1', roles });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe('GET /api/v1/careers', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/careers');
    expect(res.status).toBe(401);
  });

  it('returns 403 without cms.careers:view', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).get('/api/v1/careers').set('Authorization', authHeader());
    expect(res.status).toBe(403);
  });

  it('find-or-creates the singleton hero row when nothing has been saved yet', async () => {
    resolveMock.mockResolvedValue(['cms.careers:view']);
    prismaMock.careersPageContent.findUnique.mockResolvedValue(null);
    prismaMock.careersPageContent.create.mockResolvedValue({ id: 'singleton', heroTitle: null, heroSubtitle: null, metaTitle: null, metaDescription: null });
    const res = await request(app).get('/api/v1/careers').set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(prismaMock.careersPageContent.create).toHaveBeenCalledOnce();
  });
});

describe('PATCH /api/v1/careers', () => {
  it('returns 403 without cms.careers:edit', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).patch('/api/v1/careers').set('Authorization', authHeader()).send({ heroTitle: 'New Title' });
    expect(res.status).toBe(403);
  });

  it('upserts the hero content and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['cms.careers:edit']);
    prismaMock.careersPageContent.upsert.mockResolvedValue({ ...contentFixture, heroTitle: 'New Title' });
    const res = await request(app).patch('/api/v1/careers').set('Authorization', authHeader()).send({ heroTitle: 'New Title' });
    expect(res.status).toBe(200);
    expect(res.body.data.heroTitle).toBe('New Title');
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });
});

describe('GET /api/v1/careers/jobs', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/careers/jobs');
    expect(res.status).toBe(401);
  });

  it('returns 403 without cms.careers:view', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).get('/api/v1/careers/jobs').set('Authorization', authHeader());
    expect(res.status).toBe(403);
  });

  it('returns 200 with the paginated list, including DRAFT rows (admin caller)', async () => {
    resolveMock.mockResolvedValue(['cms.careers:view']);
    prismaMock.careersJobListing.findMany.mockResolvedValue([jobFixture]);
    prismaMock.careersJobListing.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v1/careers/jobs?page=1&pageSize=20').set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data[0].status).toBe('DRAFT');
  });

  it('lists jobs ordered by sortOrder then createdAt desc', async () => {
    resolveMock.mockResolvedValue(['cms.careers:view']);
    prismaMock.careersJobListing.findMany.mockResolvedValue([]);
    prismaMock.careersJobListing.count.mockResolvedValue(0);
    await request(app).get('/api/v1/careers/jobs').set('Authorization', authHeader());
    expect(prismaMock.careersJobListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] }),
    );
  });

  it('filters by status', async () => {
    resolveMock.mockResolvedValue(['cms.careers:view']);
    prismaMock.careersJobListing.findMany.mockResolvedValue([]);
    prismaMock.careersJobListing.count.mockResolvedValue(0);
    await request(app).get('/api/v1/careers/jobs?status=PUBLISHED').set('Authorization', authHeader());
    expect(prismaMock.careersJobListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PUBLISHED' }) }),
    );
  });

  it('filters by search (jobTitle contains, case-insensitive)', async () => {
    resolveMock.mockResolvedValue(['cms.careers:view']);
    prismaMock.careersJobListing.findMany.mockResolvedValue([]);
    prismaMock.careersJobListing.count.mockResolvedValue(0);
    await request(app).get('/api/v1/careers/jobs?search=therapist').set('Authorization', authHeader());
    expect(prismaMock.careersJobListing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ jobTitle: { contains: 'therapist', mode: 'insensitive' } }) }),
    );
  });
});

describe('POST /api/v1/careers/jobs', () => {
  it('returns 403 without cms.careers:create', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).post('/api/v1/careers/jobs').set('Authorization', authHeader()).send(validJobPayload);
    expect(res.status).toBe(403);
  });

  it('creates a job listing and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['cms.careers:create']);
    prismaMock.careersJobListing.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: JOB_ID, status: 'DRAFT', ...data }),
    );
    const res = await request(app).post('/api/v1/careers/jobs').set('Authorization', authHeader()).send(validJobPayload);
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(JOB_ID);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('returns 422 with fieldErrors when jobTitle is missing', async () => {
    resolveMock.mockResolvedValue(['cms.careers:create']);
    const { jobTitle, ...withoutJobTitle } = validJobPayload;
    void jobTitle;
    const res = await request(app).post('/api/v1/careers/jobs').set('Authorization', authHeader()).send(withoutJobTitle);
    expect(res.status).toBe(422);
    expect(res.body.error.details.fieldErrors.jobTitle).toBeDefined();
    expect(prismaMock.careersJobListing.create).not.toHaveBeenCalled();
  });

  it('returns 422 when applyUrl is not a valid URL', async () => {
    resolveMock.mockResolvedValue(['cms.careers:create']);
    const res = await request(app)
      .post('/api/v1/careers/jobs')
      .set('Authorization', authHeader())
      .send({ ...validJobPayload, applyUrl: 'not-a-url' });
    expect(res.status).toBe(422);
    expect(prismaMock.careersJobListing.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/careers/jobs/:id', () => {
  it('returns the job listing', async () => {
    resolveMock.mockResolvedValue(['cms.careers:view']);
    prismaMock.careersJobListing.findUnique.mockResolvedValue(jobFixture);
    const res = await request(app).get(`/api/v1/careers/jobs/${JOB_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(JOB_ID);
  });

  it('returns 404 when the job listing does not exist', async () => {
    resolveMock.mockResolvedValue(['cms.careers:view']);
    prismaMock.careersJobListing.findUnique.mockResolvedValue(null);
    const res = await request(app).get(`/api/v1/careers/jobs/${JOB_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/careers/jobs/:id', () => {
  it('returns 403 without cms.careers:edit', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .patch(`/api/v1/careers/jobs/${JOB_ID}`)
      .set('Authorization', authHeader())
      .send({ jobTitle: 'New Title' });
    expect(res.status).toBe(403);
  });

  it('updates the job listing', async () => {
    resolveMock.mockResolvedValue(['cms.careers:edit']);
    prismaMock.careersJobListing.findUnique.mockResolvedValue(jobFixture);
    prismaMock.careersJobListing.update.mockResolvedValue({ ...jobFixture, jobTitle: 'New Title' });
    const res = await request(app)
      .patch(`/api/v1/careers/jobs/${JOB_ID}`)
      .set('Authorization', authHeader())
      .send({ jobTitle: 'New Title' });
    expect(res.status).toBe(200);
    expect(res.body.data.jobTitle).toBe('New Title');
  });

  it('404s when the job listing does not exist', async () => {
    resolveMock.mockResolvedValue(['cms.careers:edit']);
    prismaMock.careersJobListing.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .patch(`/api/v1/careers/jobs/${JOB_ID}`)
      .set('Authorization', authHeader())
      .send({ jobTitle: 'New Title' });
    expect(res.status).toBe(404);
    expect(prismaMock.careersJobListing.update).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/careers/jobs/:id/status', () => {
  it('returns 403 without cms.careers:edit', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .patch(`/api/v1/careers/jobs/${JOB_ID}/status`)
      .set('Authorization', authHeader())
      .send({ status: 'PUBLISHED' });
    expect(res.status).toBe(403);
  });

  it('publishes a job listing', async () => {
    resolveMock.mockResolvedValue(['cms.careers:edit']);
    prismaMock.careersJobListing.findUnique.mockResolvedValue(jobFixture);
    prismaMock.careersJobListing.update.mockResolvedValue({ ...jobFixture, status: 'PUBLISHED' });
    const res = await request(app)
      .patch(`/api/v1/careers/jobs/${JOB_ID}/status`)
      .set('Authorization', authHeader())
      .send({ status: 'PUBLISHED' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PUBLISHED');
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('unpublishes a job listing back to DRAFT', async () => {
    resolveMock.mockResolvedValue(['cms.careers:edit']);
    prismaMock.careersJobListing.findUnique.mockResolvedValue({ ...jobFixture, status: 'PUBLISHED' });
    prismaMock.careersJobListing.update.mockResolvedValue({ ...jobFixture, status: 'DRAFT' });
    const res = await request(app)
      .patch(`/api/v1/careers/jobs/${JOB_ID}/status`)
      .set('Authorization', authHeader())
      .send({ status: 'DRAFT' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DRAFT');
  });

  it('rejects an invalid status value', async () => {
    resolveMock.mockResolvedValue(['cms.careers:edit']);
    const res = await request(app)
      .patch(`/api/v1/careers/jobs/${JOB_ID}/status`)
      .set('Authorization', authHeader())
      .send({ status: 'ARCHIVED' });
    expect(res.status).toBe(422);
    expect(prismaMock.careersJobListing.update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/careers/jobs/:id', () => {
  it('returns 403 without cms.careers:delete', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).delete(`/api/v1/careers/jobs/${JOB_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(403);
  });

  it('deletes the job listing and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['cms.careers:delete']);
    prismaMock.careersJobListing.findUnique.mockResolvedValue(jobFixture);
    prismaMock.careersJobListing.delete.mockResolvedValue(jobFixture);
    const res = await request(app).delete(`/api/v1/careers/jobs/${JOB_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('returns 404 when the job listing does not exist', async () => {
    resolveMock.mockResolvedValue(['cms.careers:delete']);
    prismaMock.careersJobListing.findUnique.mockResolvedValue(null);
    const res = await request(app).delete(`/api/v1/careers/jobs/${JOB_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(404);
    expect(prismaMock.careersJobListing.delete).not.toHaveBeenCalled();
  });
});
