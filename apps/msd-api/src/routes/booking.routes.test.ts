import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import app from '../app';
import { prisma } from '../lib/prisma';
import { bearerFor } from '../test-utils/auth-test-utils';

const prismaMock = vi.mocked(prisma, true);

const CUSTOMER_ID = 'a0a0a0a0-0000-4000-8000-000000000001';
const OTHER_CUSTOMER_ID = 'b0b0b0b0-0000-4000-8000-000000000002';
const BOOKING_ID = 'c0c0c0c0-0000-4000-8000-000000000003';
const SERVICE_DEAL_ID = 'd0d0d0d0-0000-4000-8000-000000000004';
const PRODUCT_DEAL_ID = 'e0e0e0e0-0000-4000-8000-000000000005';
const VENDOR_ID = 'f0f0f0f0-0000-4000-8000-000000000006';
const BRANCH_ID = 'a1a1a1a1-0000-4000-8000-000000000007';

const serviceDealFixture = {
  id: SERVICE_DEAL_ID,
  serviceId: 'svc-1',
  productId: null,
  vendorId: VENDOR_ID,
  branchId: BRANCH_ID,
  salePrice: '499.00',
  durationMinutes: 30,
};
const productDealFixture = { id: PRODUCT_DEAL_ID, serviceId: null, productId: 'prod-1', vendorId: VENDOR_ID, branchId: BRANCH_ID, salePrice: '299.00' };

const bookingFixture = {
  id: BOOKING_ID,
  customerId: CUSTOMER_ID,
  dealId: SERVICE_DEAL_ID,
  vendorId: VENDOR_ID,
  branchId: BRANCH_ID,
  priceSnapshot: '499.00',
  durationMinutesSnapshot: 30,
  status: 'PENDING',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/v1/bookings', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).post('/api/v1/bookings').send({});
    expect(res.status).toBe(401);
  });

  it('rejects a product deal (only service deals can be booked)', async () => {
    prismaMock.deal.findUnique.mockResolvedValue(productDealFixture);
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ dealId: PRODUCT_DEAL_ID, bookingDate: '2026-09-01T00:00:00.000Z', timeSlot: '10:00 AM' });
    expect(res.status).toBe(422);
    expect(prismaMock.booking.create).not.toHaveBeenCalled();
  });

  it('books a service deal, snapshotting price/duration and deriving vendor/branch from the deal (never the client)', async () => {
    prismaMock.deal.findUnique.mockResolvedValue(serviceDealFixture);
    prismaMock.booking.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: BOOKING_ID, ...data }));
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      // Client sends no vendorId/branchId — there's no field for it in the schema at all.
      .send({ dealId: SERVICE_DEAL_ID, bookingDate: '2026-09-01T00:00:00.000Z', timeSlot: '10:00 AM', quantity: 2 });
    expect(res.status).toBe(201);
    expect(prismaMock.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: CUSTOMER_ID,
          vendorId: VENDOR_ID,
          branchId: BRANCH_ID,
          priceSnapshot: '499.00',
          durationMinutesSnapshot: 30,
          quantity: 2,
        }),
      }),
    );
  });

  it('the price snapshot is copied once at booking time and is never re-derived on read', async () => {
    // Simulate the Deal's live price having since changed to 599.00 — the booking's own
    // (already-created) priceSnapshot of 499.00 must be what's returned, proving nothing in
    // getMyBookingOrThrow re-reads Deal.salePrice.
    prismaMock.booking.findUnique.mockResolvedValue({ ...bookingFixture, priceSnapshot: '499.00' });
    const res = await request(app)
      .get(`/api/v1/bookings/${BOOKING_ID}`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(200);
    expect(res.body.data.priceSnapshot).toBe('499.00');
    expect(prismaMock.deal.findUnique).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/bookings/:id — ownership scoping', () => {
  it("404s for a booking belonging to a different customer (never confirms existence)", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({ ...bookingFixture, customerId: OTHER_CUSTOMER_ID });
    const res = await request(app)
      .get(`/api/v1/bookings/${BOOKING_ID}`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/bookings/:id/status', () => {
  it('cancels a PENDING booking', async () => {
    prismaMock.booking.findUnique.mockResolvedValue(bookingFixture);
    prismaMock.booking.update.mockResolvedValue({ ...bookingFixture, status: 'CANCELLED', cancellationReason: 'Change of plans' });
    const res = await request(app)
      .patch(`/api/v1/bookings/${BOOKING_ID}/status`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ status: 'CANCELLED', cancellationReason: 'Change of plans' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
  });

  it('rejects cancelling a booking that is already CANCELLED', async () => {
    prismaMock.booking.findUnique.mockResolvedValue({ ...bookingFixture, status: 'CANCELLED' });
    const res = await request(app)
      .patch(`/api/v1/bookings/${BOOKING_ID}/status`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ status: 'CANCELLED' });
    expect(res.status).toBe(409);
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
  });

  it('rejects cancelling a COMPLETED booking', async () => {
    prismaMock.booking.findUnique.mockResolvedValue({ ...bookingFixture, status: 'COMPLETED' });
    const res = await request(app)
      .patch(`/api/v1/bookings/${BOOKING_ID}/status`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ status: 'CANCELLED' });
    expect(res.status).toBe(409);
  });

  it('rejects a status value other than CANCELLED (confirm/complete is a later, vendor-facing phase)', async () => {
    const res = await request(app)
      .patch(`/api/v1/bookings/${BOOKING_ID}/status`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(422);
  });
});

describe('GET /api/v1/bookings', () => {
  it("only queries the caller's own bookings", async () => {
    prismaMock.booking.findMany.mockResolvedValue([]);
    prismaMock.booking.count.mockResolvedValue(0);
    await request(app).get('/api/v1/bookings').set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(prismaMock.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId: CUSTOMER_ID } }),
    );
  });
});
