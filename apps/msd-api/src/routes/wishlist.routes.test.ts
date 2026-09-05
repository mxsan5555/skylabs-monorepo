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
const ITEM_ID = 'd0d0d0d0-0000-4000-8000-000000000004';
const VISIBLE_DEAL_ID = 'e0e0e0e0-0000-4000-8000-000000000005';
const HIDDEN_DEAL_ID = 'f0f0f0f0-0000-4000-8000-000000000006';

const visibleDealFixture = { id: VISIBLE_DEAL_ID, status: 'ACTIVE', approvalStatus: 'APPROVED' };

const wishlistItemFixture = {
  id: ITEM_ID,
  dealId: VISIBLE_DEAL_ID,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  deal: {
    id: VISIBLE_DEAL_ID,
    title: 'Facial at Glow Beauty Studio',
    slug: 'facial-glow-golghar',
    salePrice: '999.00',
    originalPrice: '1299.00',
    discountPercent: 23,
    durationMinutes: 60,
    images: ['https://example.com/deal.jpg'],
    service: { id: 'svc-1', name: 'Facial', image: null, imageAlt: null },
    product: null,
    vendor: { id: 'vendor-1', businessName: 'Glow Beauty Studio', city: 'Gorakhpur', logoUrl: null },
    branch: { id: 'branch-1', name: 'Golghar', city: 'Gorakhpur' },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/wishlist', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/wishlist');
    expect(res.status).toBe(401);
  });

  it("lists the caller's wishlist with real deal data, scoped to VISIBLE_DEAL_WHERE", async () => {
    prismaMock.wishlistItem.findMany.mockResolvedValue([wishlistItemFixture]);
    const res = await request(app)
      .get('/api/v1/wishlist')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].deal.title).toBe('Facial at Glow Beauty Studio');
    expect(prismaMock.wishlistItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ customerId: CUSTOMER_ID, deal: expect.objectContaining({ status: 'ACTIVE' }) }),
      }),
    );
  });

  it('never returns an item whose deal no longer passes VISIBLE_DEAL_WHERE (query-level filter, so the mock simply returns nothing for a hidden deal)', async () => {
    prismaMock.wishlistItem.findMany.mockResolvedValue([]);
    const res = await request(app)
      .get('/api/v1/wishlist')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('POST /api/v1/wishlist', () => {
  it('rejects a deal that fails VISIBLE_DEAL_WHERE (inactive/rejected/suspended-vendor) with 404', async () => {
    prismaMock.deal.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/v1/wishlist')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ dealId: HIDDEN_DEAL_ID });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(prismaMock.wishlistItem.create).not.toHaveBeenCalled();
  });

  it('adds a visible deal to the wishlist', async () => {
    prismaMock.deal.findFirst.mockResolvedValue(visibleDealFixture);
    prismaMock.wishlistItem.findUnique.mockResolvedValue(null);
    prismaMock.wishlistItem.create.mockResolvedValue({ id: ITEM_ID, customerId: CUSTOMER_ID, dealId: VISIBLE_DEAL_ID });
    prismaMock.wishlistItem.findUniqueOrThrow.mockResolvedValue(wishlistItemFixture);

    const res = await request(app)
      .post('/api/v1/wishlist')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ dealId: VISIBLE_DEAL_ID });

    expect(res.status).toBe(201);
    expect(res.body.data.dealId).toBe(VISIBLE_DEAL_ID);
    expect(prismaMock.wishlistItem.create).toHaveBeenCalledWith({
      data: { customerId: CUSTOMER_ID, dealId: VISIBLE_DEAL_ID },
    });
  });

  it('adding the same deal twice is idempotent — does not create a duplicate or error', async () => {
    prismaMock.deal.findFirst.mockResolvedValue(visibleDealFixture);
    prismaMock.wishlistItem.findUnique.mockResolvedValue({ id: ITEM_ID, customerId: CUSTOMER_ID, dealId: VISIBLE_DEAL_ID });
    prismaMock.wishlistItem.findUniqueOrThrow.mockResolvedValue(wishlistItemFixture);

    const res = await request(app)
      .post('/api/v1/wishlist')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ dealId: VISIBLE_DEAL_ID });

    expect(res.status).toBe(201);
    expect(prismaMock.wishlistItem.create).not.toHaveBeenCalled();
  });

  it('treats a concurrent duplicate (P2002) as success rather than surfacing a raw DB error', async () => {
    prismaMock.deal.findFirst.mockResolvedValue(visibleDealFixture);
    prismaMock.wishlistItem.findUnique.mockResolvedValue(null);
    const { Prisma } = await import('../generated/prisma-client');
    prismaMock.wishlistItem.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '6.19.3' }),
    );
    prismaMock.wishlistItem.findUniqueOrThrow.mockResolvedValue(wishlistItemFixture);

    const res = await request(app)
      .post('/api/v1/wishlist')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ dealId: VISIBLE_DEAL_ID });

    expect(res.status).toBe(201);
    expect(res.body.data.dealId).toBe(VISIBLE_DEAL_ID);
  });
});

describe('DELETE /api/v1/wishlist/:dealId — ownership scoping', () => {
  it('removes the caller own item', async () => {
    prismaMock.wishlistItem.deleteMany.mockResolvedValue({ count: 1 });
    const res = await request(app)
      .delete(`/api/v1/wishlist/${VISIBLE_DEAL_ID}`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.wishlistItem.deleteMany).toHaveBeenCalledWith({ where: { customerId: CUSTOMER_ID, dealId: VISIBLE_DEAL_ID } });
  });

  it("404s attempting to delete another customer's wishlist item (matches zero rows, never touches it)", async () => {
    // Customer B's row for this deal exists in the DB, but the query is scoped to CUSTOMER_ID,
    // so the mocked deleteMany (which stands in for a `where: {customerId, dealId}` match)
    // correctly reports 0 rows affected for a request made as a different customer.
    prismaMock.wishlistItem.deleteMany.mockResolvedValue({ count: 0 });
    const res = await request(app)
      .delete(`/api/v1/wishlist/${VISIBLE_DEAL_ID}`)
      .set('Authorization', bearerFor({ sub: OTHER_CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(404);
    expect(prismaMock.wishlistItem.deleteMany).toHaveBeenCalledWith({ where: { customerId: OTHER_CUSTOMER_ID, dealId: VISIBLE_DEAL_ID } });
  });
});

describe('GET /api/v1/wishlist/check/:dealId', () => {
  it('returns wishlisted: true when the item exists for the caller', async () => {
    prismaMock.wishlistItem.findUnique.mockResolvedValue({ id: ITEM_ID, customerId: CUSTOMER_ID, dealId: VISIBLE_DEAL_ID });
    const res = await request(app)
      .get(`/api/v1/wishlist/check/${VISIBLE_DEAL_ID}`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ wishlisted: true });
  });

  it('returns wishlisted: false when no item exists', async () => {
    prismaMock.wishlistItem.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .get(`/api/v1/wishlist/check/${VISIBLE_DEAL_ID}`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ wishlisted: false });
  });
});
