import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import app from '../app';
import { prisma } from '../lib/prisma';

const prismaMock = vi.mocked(prisma, true);

let emailCounter = 0;
function uniqueBody(overrides: Record<string, unknown> = {}) {
  emailCounter += 1;
  return {
    businessName: 'Sunrise Spa',
    businessEmail: `hello${emailCounter}@example.com`,
    businessPhone: '9876543210',
    ownerFirstName: 'Asha',
    ownerLastName: 'Rao',
    ownerEmail: `asha${emailCounter}@example.com`,
    ownerMobile: '9876543210',
    address: '12 Market Road',
    city: 'Gorakhpur',
    state: 'Uttar Pradesh',
    pincode: '273001',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/v1/vendors/public/register', () => {
  it('accepts a valid application and stores it without creating a user or vendor', async () => {
    prismaMock.vendorApplication.create.mockResolvedValue({
      id: 'app-1',
      status: 'PENDING',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    });

    const res = await request(app).post('/api/v1/vendors/public/register').send(uniqueBody());

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: 'app-1',
      status: 'PENDING',
      message: 'Your application has been submitted successfully. Our team will review it and contact you.',
    });
    expect(prismaMock.vendorApplication.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessName: 'Sunrise Spa',
          ownerEmail: 'asha1@example.com',
          pincode: '273001',
        }),
      }),
    );
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.member.create).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects missing required fields', async () => {
    const res = await request(app)
      .post('/api/v1/vendors/public/register')
      .send({ businessName: 'Sunrise Spa' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fieldErrors).toHaveProperty('businessEmail');
  });

  it('rejects malformed email, mobile and pincode values', async () => {
    const res = await request(app)
      .post('/api/v1/vendors/public/register')
      .send(
        uniqueBody({
          businessEmail: 'not-an-email',
          businessPhone: '123',
          ownerMobile: '123',
          pincode: '12345',
        }),
      );

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rate-limits repeated attempts for the same identity (5/10min, same wiring as otpRequestRateLimiter)', async () => {
    const body = uniqueBody();
    let lastStatus = 0;
    for (let i = 0; i < 6; i++) {
      const res = await request(app).post('/api/v1/vendors/public/register').send(body);
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
