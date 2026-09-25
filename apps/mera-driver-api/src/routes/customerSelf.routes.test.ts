import request from 'supertest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';

vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

import { app } from '../app';
import { signAccessToken } from '../lib/jwt';

const OWN_CUSTOMER = { id: 'customer-1', userId: 'user-1', firstName: 'Anita', documents: [] };

function tokenFor(userId: string) {
  return signAccessToken({ sub: userId, roles: ['customer'], app: 'mera-driver' });
}

beforeEach(() => {
  resetPrismaMock();
});

describe('GET /customers/me', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/customers/me');
    expect(res.status).toBe(401);
  });

  it('returns 404 CUSTOMER_NOT_LINKED when the caller has no linked Customer', async () => {
    mockPrisma.customer.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/customers/me').set('Authorization', `Bearer ${tokenFor('user-1')}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CUSTOMER_NOT_LINKED');
  });

  it("returns the caller's own customer record, resolved from the JWT subject — never a param", async () => {
    mockPrisma.customer.findUnique
      .mockResolvedValueOnce({ id: 'customer-1' })
      .mockResolvedValueOnce(OWN_CUSTOMER);

    const res = await request(app).get('/customers/me').set('Authorization', `Bearer ${tokenFor('user-1')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('customer-1');
    expect(mockPrisma.customer.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
  });
});

describe('deactivated customer blocked from the self-service portal', () => {
  it('returns 403 CUSTOMER_DEACTIVATED instead of the customer record', async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ id: 'customer-1', accountStatus: 'Inactive' });

    const res = await request(app).get('/customers/me').set('Authorization', `Bearer ${tokenFor('user-1')}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CUSTOMER_DEACTIVATED');
  });

  it('an active customer is unaffected', async () => {
    mockPrisma.customer.findUnique
      .mockResolvedValueOnce({ id: 'customer-1', accountStatus: 'Active' })
      .mockResolvedValueOnce(OWN_CUSTOMER);

    const res = await request(app).get('/customers/me').set('Authorization', `Bearer ${tokenFor('user-1')}`);

    expect(res.status).toBe(200);
  });
});

describe('PATCH /customers/me', () => {
  beforeEach(() => {
    mockPrisma.customer.findUnique.mockResolvedValue({ id: 'customer-1' });
    mockPrisma.customer.update.mockResolvedValue(OWN_CUSTOMER);
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it('updates a self-editable field', async () => {
    const res = await request(app)
      .patch('/customers/me')
      .set('Authorization', `Bearer ${tokenFor('user-1')}`)
      .send({ firstName: 'Anita Sharma' });

    expect(res.status).toBe(200);
    expect(mockPrisma.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'customer-1' }, data: expect.objectContaining({ firstName: 'Anita Sharma' }) }),
    );
  });

  it('silently strips `accountStatus` — a customer cannot self-reactivate/deactivate', async () => {
    await request(app)
      .patch('/customers/me')
      .set('Authorization', `Bearer ${tokenFor('user-1')}`)
      .send({ accountStatus: 'Inactive', firstName: 'Anita Sharma' });

    const callArg = mockPrisma.customer.update.mock.calls[0]?.[0];
    expect(callArg.data).not.toHaveProperty('accountStatus');
    expect(callArg.data.firstName).toBe('Anita Sharma');
  });

  it('silently strips `verificationStatus`', async () => {
    await request(app)
      .patch('/customers/me')
      .set('Authorization', `Bearer ${tokenFor('user-1')}`)
      .send({ verificationStatus: 'Verified' });

    const callArg = mockPrisma.customer.update.mock.calls[0]?.[0];
    expect(callArg.data).not.toHaveProperty('verificationStatus');
  });
});

describe('GET /customers/me/bookings', () => {
  it("returns only the caller's own bookings, scoped by customerId", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ id: 'customer-1' });
    mockPrisma.booking.findMany.mockResolvedValue([{ id: 'booking-1', customerId: 'customer-1' }]);

    const res = await request(app).get('/customers/me/bookings').set('Authorization', `Bearer ${tokenFor('user-1')}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId: 'customer-1' } }),
    );
  });
});

describe('customer A cannot reach customer B via any /customers/me* route', () => {
  it('customerId always comes from the mocked JWT subject, never accepted from the client', async () => {
    mockPrisma.customer.findUnique.mockResolvedValueOnce({ id: 'customer-1' }).mockResolvedValueOnce(OWN_CUSTOMER);

    const res = await request(app)
      .get('/customers/me')
      .set('Authorization', `Bearer ${tokenFor('user-1')}`)
      .query({ customerId: 'customer-2', id: 'customer-2' }); // attempted manipulation — ignored

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('customer-1');
    expect(mockPrisma.customer.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1' } }));
  });
});
