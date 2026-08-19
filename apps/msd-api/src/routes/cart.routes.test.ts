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
const CART_ID = 'c0c0c0c0-0000-4000-8000-000000000003';
const ITEM_ID = 'd0d0d0d0-0000-4000-8000-000000000004';
const PRODUCT_DEAL_ID = 'e0e0e0e0-0000-4000-8000-000000000005';
const SERVICE_DEAL_ID = 'f0f0f0f0-0000-4000-8000-000000000006';
const VENDOR_A_ID = 'a1a1a1a1-0000-4000-8000-000000000007';
const VENDOR_B_ID = 'a2a2a2a2-0000-4000-8000-000000000008';
const BRANCH_A_ID = 'a3a3a3a3-0000-4000-8000-000000000009';
const BRANCH_B_ID = 'a4a4a4a4-0000-4000-8000-00000000000a';

const emptyCart = { id: CART_ID, customerId: CUSTOMER_ID, items: [] };
const productDealFixture = { id: PRODUCT_DEAL_ID, productId: 'prod-1', serviceId: null, vendorId: VENDOR_A_ID, branchId: BRANCH_A_ID, salePrice: '299.00' };
const serviceDealFixture = { id: SERVICE_DEAL_ID, productId: null, serviceId: 'svc-1', vendorId: VENDOR_A_ID, branchId: BRANCH_A_ID, salePrice: '499.00' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/cart', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/cart');
    expect(res.status).toBe(401);
  });

  it('lazily creates and returns an empty cart for a first-time caller', async () => {
    prismaMock.cart.upsert.mockResolvedValue(emptyCart);
    const res = await request(app).get('/api/v1/cart').set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
    expect(prismaMock.cart.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { customerId: CUSTOMER_ID } }));
  });
});

describe('POST /api/v1/cart/items', () => {
  it('rejects a service deal (only product deals can be added to a cart)', async () => {
    prismaMock.deal.findUnique.mockResolvedValue(serviceDealFixture);
    const res = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ dealId: SERVICE_DEAL_ID, quantity: 1 });
    expect(res.status).toBe(422);
    expect(prismaMock.cartItem.create).not.toHaveBeenCalled();
  });

  it('adds a product deal to an empty cart', async () => {
    prismaMock.deal.findUnique.mockResolvedValue(productDealFixture);
    prismaMock.cart.upsert.mockResolvedValue(emptyCart);
    prismaMock.cartItem.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ dealId: PRODUCT_DEAL_ID, quantity: 2 });
    expect(res.status).toBe(201);
    expect(prismaMock.cartItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dealId: PRODUCT_DEAL_ID, quantity: 2, unitPrice: '299.00' }) }),
    );
  });

  it('increments quantity instead of duplicating a row when the same deal is added again', async () => {
    prismaMock.deal.findUnique.mockResolvedValue(productDealFixture);
    prismaMock.cart.upsert.mockResolvedValue(emptyCart);
    prismaMock.cartItem.findUnique.mockResolvedValue({ id: ITEM_ID, cartId: CART_ID, dealId: PRODUCT_DEAL_ID, quantity: 2 });
    const res = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ dealId: PRODUCT_DEAL_ID, quantity: 1 });
    expect(res.status).toBe(201);
    expect(prismaMock.cartItem.update).toHaveBeenCalledWith({ where: { id: ITEM_ID }, data: { quantity: 3 } });
    expect(prismaMock.cartItem.create).not.toHaveBeenCalled();
  });

  it('allows adding a deal from a DIFFERENT vendor than what is already in the cart (multi-vendor cart)', async () => {
    prismaMock.deal.findUnique.mockResolvedValue({ ...productDealFixture, vendorId: VENDOR_B_ID, branchId: BRANCH_B_ID });
    prismaMock.cart.upsert.mockResolvedValue(emptyCart);
    prismaMock.cartItem.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ dealId: PRODUCT_DEAL_ID, quantity: 1 });
    expect(res.status).toBe(201);
    expect(prismaMock.cartItem.create).toHaveBeenCalled();
  });
});

describe('PATCH/DELETE /api/v1/cart/items/:id — ownership scoping', () => {
  it('404s when updating an item that belongs to a different customer (never confirms existence)', async () => {
    prismaMock.cartItem.findUnique.mockResolvedValue({ id: ITEM_ID, cart: { customerId: OTHER_CUSTOMER_ID } });
    const res = await request(app)
      .patch(`/api/v1/cart/items/${ITEM_ID}`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ quantity: 5 });
    expect(res.status).toBe(404);
    expect(prismaMock.cartItem.update).not.toHaveBeenCalled();
  });

  it('updates quantity for an item the caller owns', async () => {
    prismaMock.cartItem.findUnique.mockResolvedValue({ id: ITEM_ID, cart: { customerId: CUSTOMER_ID } });
    prismaMock.cart.upsert.mockResolvedValue(emptyCart);
    const res = await request(app)
      .patch(`/api/v1/cart/items/${ITEM_ID}`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ quantity: 5 });
    expect(res.status).toBe(200);
    expect(prismaMock.cartItem.update).toHaveBeenCalledWith({ where: { id: ITEM_ID }, data: { quantity: 5 } });
  });

  it('removes an item the caller owns', async () => {
    prismaMock.cartItem.findUnique.mockResolvedValue({ id: ITEM_ID, cart: { customerId: CUSTOMER_ID } });
    prismaMock.cart.upsert.mockResolvedValue(emptyCart);
    const res = await request(app)
      .delete(`/api/v1/cart/items/${ITEM_ID}`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.cartItem.delete).toHaveBeenCalledWith({ where: { id: ITEM_ID } });
  });
});

describe('DELETE /api/v1/cart', () => {
  it('clears every item', async () => {
    prismaMock.cart.upsert.mockResolvedValue(emptyCart);
    const res = await request(app).delete('/api/v1/cart').set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: CART_ID } });
  });
});
