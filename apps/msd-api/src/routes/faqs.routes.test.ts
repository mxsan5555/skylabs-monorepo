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

const FAQ_ID = 'a0a0a0a0-0000-4000-8000-000000000001';

const faqFixture = {
  id: FAQ_ID,
  question: 'How do I book a spa deal?',
  answer: 'Select your preferred deal, choose a date and time, then complete the payment.',
  isActive: true,
  sortOrder: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const validCreatePayload = {
  question: 'Can I cancel my booking?',
  answer: 'Yes, before the cancellation deadline on the deal page.',
  sortOrder: 1,
};

function authHeader(roles: string[] = ['admin']) {
  return bearerFor({ sub: 'admin-1', roles });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe('GET /api/v1/faqs', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/faqs');
    expect(res.status).toBe(401);
  });

  it('returns 403 without cms.faq:view', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).get('/api/v1/faqs').set('Authorization', authHeader());
    expect(res.status).toBe(403);
  });

  it('returns 200 with the paginated list, including inactive rows (admin caller)', async () => {
    resolveMock.mockResolvedValue(['cms.faq:view']);
    prismaMock.faq.findMany.mockResolvedValue([{ ...faqFixture, isActive: false }]);
    prismaMock.faq.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v1/faqs?page=2&pageSize=10').set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].isActive).toBe(false);
    expect(res.body.meta).toEqual(expect.objectContaining({ total: 1, page: 2, pageSize: 10 }));
    expect(prismaMock.faq.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10 }));
  });

  it('orders by sortOrder then createdAt', async () => {
    resolveMock.mockResolvedValue(['cms.faq:view']);
    prismaMock.faq.findMany.mockResolvedValue([]);
    prismaMock.faq.count.mockResolvedValue(0);
    await request(app).get('/api/v1/faqs').set('Authorization', authHeader());
    expect(prismaMock.faq.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    );
  });

  it('filters by search (question contains, case-insensitive)', async () => {
    resolveMock.mockResolvedValue(['cms.faq:view']);
    prismaMock.faq.findMany.mockResolvedValue([]);
    prismaMock.faq.count.mockResolvedValue(0);
    await request(app).get('/api/v1/faqs?search=cancel').set('Authorization', authHeader());
    expect(prismaMock.faq.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ question: { contains: 'cancel', mode: 'insensitive' } }) }),
    );
  });
});

describe('POST /api/v1/faqs', () => {
  it('returns 403 without cms.faq:create', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).post('/api/v1/faqs').set('Authorization', authHeader()).send(validCreatePayload);
    expect(res.status).toBe(403);
  });

  it('creates an FAQ and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['cms.faq:create']);
    prismaMock.faq.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: FAQ_ID, isActive: true, ...data }),
    );
    const res = await request(app).post('/api/v1/faqs').set('Authorization', authHeader()).send(validCreatePayload);
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(FAQ_ID);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('returns 422 with fieldErrors when question is missing', async () => {
    resolveMock.mockResolvedValue(['cms.faq:create']);
    const { question, ...withoutQuestion } = validCreatePayload;
    void question;
    const res = await request(app).post('/api/v1/faqs').set('Authorization', authHeader()).send(withoutQuestion);
    expect(res.status).toBe(422);
    expect(res.body.error.details.fieldErrors.question).toBeDefined();
    expect(prismaMock.faq.create).not.toHaveBeenCalled();
  });

  it('returns 422 with fieldErrors when answer is missing', async () => {
    resolveMock.mockResolvedValue(['cms.faq:create']);
    const { answer, ...withoutAnswer } = validCreatePayload;
    void answer;
    const res = await request(app).post('/api/v1/faqs').set('Authorization', authHeader()).send(withoutAnswer);
    expect(res.status).toBe(422);
    expect(res.body.error.details.fieldErrors.answer).toBeDefined();
    expect(prismaMock.faq.create).not.toHaveBeenCalled();
  });

  it('defaults sortOrder to 0 when omitted', async () => {
    resolveMock.mockResolvedValue(['cms.faq:create']);
    prismaMock.faq.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: FAQ_ID, isActive: true, ...data }),
    );
    const { sortOrder, ...withoutSortOrder } = validCreatePayload;
    void sortOrder;
    const res = await request(app).post('/api/v1/faqs').set('Authorization', authHeader()).send(withoutSortOrder);
    expect(res.status).toBe(201);
    expect(res.body.data.sortOrder).toBe(0);
  });
});

describe('PATCH /api/v1/faqs/:id', () => {
  it('returns 403 without cms.faq:edit', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .patch(`/api/v1/faqs/${FAQ_ID}`)
      .set('Authorization', authHeader())
      .send({ question: 'New question?' });
    expect(res.status).toBe(403);
  });

  it('updates the FAQ', async () => {
    resolveMock.mockResolvedValue(['cms.faq:edit']);
    prismaMock.faq.findUnique.mockResolvedValue(faqFixture);
    prismaMock.faq.update.mockResolvedValue({ ...faqFixture, question: 'New question?' });
    const res = await request(app)
      .patch(`/api/v1/faqs/${FAQ_ID}`)
      .set('Authorization', authHeader())
      .send({ question: 'New question?' });
    expect(res.status).toBe(200);
    expect(res.body.data.question).toBe('New question?');
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('404s when the FAQ does not exist', async () => {
    resolveMock.mockResolvedValue(['cms.faq:edit']);
    prismaMock.faq.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .patch(`/api/v1/faqs/${FAQ_ID}`)
      .set('Authorization', authHeader())
      .send({ question: 'New question?' });
    expect(res.status).toBe(404);
    expect(prismaMock.faq.update).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/faqs/:id/status', () => {
  it('returns 403 without cms.faq:edit', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .patch(`/api/v1/faqs/${FAQ_ID}/status`)
      .set('Authorization', authHeader())
      .send({ isActive: false });
    expect(res.status).toBe(403);
  });

  it('deactivates the FAQ', async () => {
    resolveMock.mockResolvedValue(['cms.faq:edit']);
    prismaMock.faq.findUnique.mockResolvedValue(faqFixture);
    prismaMock.faq.update.mockResolvedValue({ ...faqFixture, isActive: false });
    const res = await request(app)
      .patch(`/api/v1/faqs/${FAQ_ID}/status`)
      .set('Authorization', authHeader())
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('rejects a non-boolean isActive', async () => {
    resolveMock.mockResolvedValue(['cms.faq:edit']);
    const res = await request(app)
      .patch(`/api/v1/faqs/${FAQ_ID}/status`)
      .set('Authorization', authHeader())
      .send({ isActive: 'yes' });
    expect(res.status).toBe(422);
    expect(prismaMock.faq.update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/faqs/:id', () => {
  it('returns 403 without cms.faq:delete', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).delete(`/api/v1/faqs/${FAQ_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(403);
  });

  it('deletes the FAQ and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['cms.faq:delete']);
    prismaMock.faq.findUnique.mockResolvedValue(faqFixture);
    prismaMock.faq.delete.mockResolvedValue(faqFixture);
    const res = await request(app).delete(`/api/v1/faqs/${FAQ_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('returns 404 when the FAQ does not exist', async () => {
    resolveMock.mockResolvedValue(['cms.faq:delete']);
    prismaMock.faq.findUnique.mockResolvedValue(null);
    const res = await request(app).delete(`/api/v1/faqs/${FAQ_ID}`).set('Authorization', authHeader());
    expect(res.status).toBe(404);
    expect(prismaMock.faq.delete).not.toHaveBeenCalled();
  });
});
