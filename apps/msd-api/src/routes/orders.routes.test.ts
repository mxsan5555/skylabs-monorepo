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

const CUSTOMER_ID = 'a0a0a0a0-0000-4000-8000-000000000001';
const OTHER_CUSTOMER_ID = 'b0b0b0b0-0000-4000-8000-000000000002';
const CART_ID = 'c0c0c0c0-0000-4000-8000-000000000003';
const CART_ITEM_ID = 'd0d0d0d0-0000-4000-8000-000000000004';
const PRODUCT_ID = 'e0e0e0e0-0000-4000-8000-000000000005';
const SERVICE_DEAL_ID = 'f0f0f0f0-0000-4000-8000-000000000006';
const VENDOR_A_ID = 'a1a1a1a1-0000-4000-8000-000000000007';
const VENDOR_B_ID = 'a2a2a2a2-0000-4000-8000-000000000008';
const BRANCH_A_ID = 'a3a3a3a3-0000-4000-8000-000000000009';
const ORDER_ID = 'a5a5a5a5-0000-4000-8000-00000000000b';
const DEAL_PACKAGE_ID = 'a6a6a6a6-0000-4000-8000-00000000000c';
const THERAPIST_ID = 'a7a7a7a7-0000-4000-8000-00000000000d';
const THERAPIST_PACKAGE_ID = 'a8a8a8a8-0000-4000-8000-00000000000e';
const SERVICE_CART_ITEM_ID = 'a9a9a9a9-0000-4000-8000-00000000000f';
const THERAPIST_CART_ITEM_ID = 'b0b0c0c0-0000-4000-8000-000000000010';

const vendorAFixture = { id: VENDOR_A_ID, businessName: 'ABC Salon', status: 'ACTIVE' };
const branchAFixture = { id: BRANCH_A_ID, name: 'Gorakhpur Branch', isActive: true };

const cartWithOneItem = {
  id: CART_ID,
  customerId: CUSTOMER_ID,
  items: [{ id: CART_ITEM_ID, cartId: CART_ID, productId: PRODUCT_ID, quantity: 2, unitPrice: '150.00' }], // stale unitPrice — live product price is 199.00
};

const productFixture = {
  id: PRODUCT_ID,
  isActive: true,
  vendorId: VENDOR_A_ID,
  name: 'Face Cream',
  price: '199.00', // the live, current price — must be what's used, not the stale cart snapshot of 150.00
  vendor: vendorAFixture,
};

const serviceDealFixture = {
  id: SERVICE_DEAL_ID,
  vendorId: VENDOR_A_ID,
  branchId: BRANCH_A_ID,
  title: 'Haircut deal',
  vendor: vendorAFixture,
  branch: branchAFixture,
};

const dealPackageFixture = { id: DEAL_PACKAGE_ID, dealId: SERVICE_DEAL_ID, isActive: true, sellingPrice: '299.00', durationMinutes: 30 };

const therapistFixture = {
  id: THERAPIST_ID,
  isActive: true,
  vendorId: VENDOR_A_ID,
  branchId: BRANCH_A_ID,
  therapistType: 'Therapist',
  personName: 'Ramesh Kumar',
  vendor: vendorAFixture,
  branch: branchAFixture,
};

const therapistPackageFixture = { id: THERAPIST_PACKAGE_ID, therapistId: THERAPIST_ID, isActive: true, sellingPrice: '499.00', durationMinutes: 60 };

const orderFixture = {
  id: ORDER_ID,
  customerId: CUSTOMER_ID,
  vendorId: VENDOR_A_ID,
  branchId: null, // Product has no branch — see Product's own schema doc comment.
  type: 'PRODUCT',
  status: 'PENDING_PAYMENT',
  vendorNameSnapshot: 'ABC Salon',
  branchNameSnapshot: null,
  subtotal: '398.00',
  total: '398.00',
  items: [{
    id: 'oi-1',
    productId: PRODUCT_ID,
    vendorId: VENDOR_A_ID,
    branchId: null,
    vendorNameSnapshot: 'ABC Salon',
    branchNameSnapshot: null,
    itemName: 'Face Cream',
    itemType: 'PRODUCT',
    unitPrice: '199.00',
    quantity: 2,
    lineTotal: '398.00',
    durationMinutes: null,
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe('POST /api/v1/orders/checkout — Product Cart -> Order', () => {
  it('1. creates a PRODUCT order from the cart', async () => {
    prismaMock.cart.findUnique.mockResolvedValue(cartWithOneItem);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.product.findFirst.mockResolvedValue(productFixture);
    prismaMock.order.create.mockResolvedValue(orderFixture);
    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe('PRODUCT');
  });

  it('8/9. snapshots vendor name at creation time; branch stays null — Product has no branch', async () => {
    prismaMock.cart.findUnique.mockResolvedValue(cartWithOneItem);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.product.findFirst.mockResolvedValue(productFixture);
    prismaMock.order.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: ORDER_ID, ...data }));
    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(201);
    expect(prismaMock.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ vendorNameSnapshot: 'ABC Salon', branchId: null, branchNameSnapshot: null }) }),
    );
  });

  it('19. recalculates price server-side from the LIVE product price, never the stale CartItem.unitPrice', async () => {
    prismaMock.cart.findUnique.mockResolvedValue(cartWithOneItem); // cart item unitPrice snapshot: 150.00 (stale)
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.product.findFirst.mockResolvedValue(productFixture); // live price: 199.00
    prismaMock.order.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: ORDER_ID, ...data }));
    await request(app).post('/api/v1/orders/checkout').set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    const call = prismaMock.order.create.mock.calls[0][0];
    const itemCreate = call.data.items.create[0];
    expect(itemCreate.unitPrice.toString()).toBe('199');
    expect(call.data.subtotal.toString()).toBe('398'); // 199 * qty(2), not 150 * 2 = 300
  });

  it('12. links the cart to its new order (pendingOrderId) instead of deleting cart items at checkout time', async () => {
    // CartItem rows are deliberately NOT deleted here anymore — only once payment actually
    // succeeds (finalizeCartForOrder, called from payment.service.ts). Checkout submission just
    // links the cart to its new Order via pendingOrderId, so a repeat checkout call can reuse it
    // (see the next test) and a failed/abandoned payment leaves the cart intact for retry.
    prismaMock.cart.findUnique.mockResolvedValue(cartWithOneItem);
    prismaMock.product.findFirst.mockResolvedValue(productFixture);
    prismaMock.order.create.mockResolvedValue(orderFixture);
    await request(app).post('/api/v1/orders/checkout').set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(prismaMock.cartItem.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.cart.update).toHaveBeenCalledWith({ where: { id: CART_ID }, data: { pendingOrderId: ORDER_ID } });
  });

  it('12b. a repeat checkout call reuses the still-PENDING_PAYMENT order from a previous checkout instead of creating a duplicate', async () => {
    prismaMock.cart.findUnique.mockResolvedValue({ ...cartWithOneItem, pendingOrderId: ORDER_ID });
    prismaMock.order.findUnique.mockResolvedValue({ ...orderFixture, status: 'PENDING_PAYMENT' });
    const res = await request(app).post('/api/v1/orders/checkout').set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(ORDER_ID);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('12c. a stale pendingOrderId pointing at a CANCELLED order is cleared and a fresh order is created from the still-intact cart', async () => {
    prismaMock.cart.findUnique.mockResolvedValue({ ...cartWithOneItem, pendingOrderId: ORDER_ID });
    prismaMock.order.findUnique.mockResolvedValue({ ...orderFixture, status: 'CANCELLED' });
    prismaMock.product.findFirst.mockResolvedValue(productFixture);
    prismaMock.order.create.mockResolvedValue(orderFixture);
    const res = await request(app).post('/api/v1/orders/checkout').set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(201);
    expect(prismaMock.cart.update).toHaveBeenCalledWith({ where: { id: CART_ID }, data: { pendingOrderId: null } });
    expect(prismaMock.order.create).toHaveBeenCalled();
  });

  it('13/20. leaves the cart intact and creates nothing when a product fails revalidation (transaction rollback)', async () => {
    prismaMock.cart.findUnique.mockResolvedValue(cartWithOneItem);
    prismaMock.product.findFirst.mockResolvedValue(null); // product went inactive/vendor suspended since being added to cart
    const res = await request(app).post('/api/v1/orders/checkout').set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(409);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
    expect(prismaMock.cartItem.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects checkout of an empty cart', async () => {
    prismaMock.cart.findUnique.mockResolvedValue({ ...cartWithOneItem, items: [] });
    const res = await request(app).post('/api/v1/orders/checkout').set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(422);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('stores the checkout "Customer Details" step contact/shipping fields on the order', async () => {
    prismaMock.cart.findUnique.mockResolvedValue(cartWithOneItem);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.product.findFirst.mockResolvedValue(productFixture);
    prismaMock.order.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: ORDER_ID, ...data }));
    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({
        contactName: 'Priya Sharma',
        contactPhone: '9810099999',
        contactEmail: 'priya@example.com',
        shippingAddress: '12 MG Road',
        shippingCity: 'Gorakhpur',
        shippingState: 'Uttar Pradesh',
        shippingPincode: '273001',
      });
    expect(res.status).toBe(201);
    expect(prismaMock.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactName: 'Priya Sharma',
          contactPhone: '9810099999',
          contactEmail: 'priya@example.com',
          shippingAddress: '12 MG Road',
          shippingCity: 'Gorakhpur',
          shippingState: 'Uttar Pradesh',
          shippingPincode: '273001',
        }),
      }),
    );
  });

  it('rejects a malformed pincode on checkout with a field-level validation error', async () => {
    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ shippingPincode: '123' }); // must be exactly 6 digits
    expect(res.status).toBe(422);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('rejects a malformed contact phone on checkout with a field-level validation error', async () => {
    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ contactPhone: '12345' }); // not a valid 10-digit Indian mobile number
    expect(res.status).toBe(422);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/orders/checkout — mixed cart (Deal + Product + Therapist -> ONE Order)', () => {
  it('creates ONE order with a Deal, a Product, and a Therapist line, each snapshotted from its own live price', async () => {
    const mixedCart = {
      id: CART_ID,
      customerId: CUSTOMER_ID,
      items: [
        { id: CART_ITEM_ID, cartId: CART_ID, productId: PRODUCT_ID, dealId: null, dealPackageId: null, therapistId: null, therapistPackageId: null, quantity: 2, unitPrice: '150.00' },
        { id: SERVICE_CART_ITEM_ID, cartId: CART_ID, dealId: SERVICE_DEAL_ID, dealPackageId: DEAL_PACKAGE_ID, therapistId: null, therapistPackageId: null, productId: null, quantity: 1, unitPrice: '299.00' },
        { id: THERAPIST_CART_ITEM_ID, cartId: CART_ID, dealId: null, dealPackageId: null, therapistId: THERAPIST_ID, therapistPackageId: THERAPIST_PACKAGE_ID, productId: null, quantity: 1, unitPrice: '499.00' },
      ],
    };
    prismaMock.cart.findUnique.mockResolvedValue(mixedCart);
    prismaMock.product.findFirst.mockResolvedValue(productFixture);
    prismaMock.deal.findFirst.mockResolvedValue(serviceDealFixture);
    prismaMock.dealPackage.findUnique.mockResolvedValue(dealPackageFixture);
    prismaMock.therapist.findFirst.mockResolvedValue(therapistFixture);
    prismaMock.therapistPackage.findUnique.mockResolvedValue(therapistPackageFixture);
    prismaMock.order.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: ORDER_ID, ...data }));

    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));

    expect(res.status).toBe(201);
    expect(prismaMock.order.create).toHaveBeenCalledTimes(1);
    const call = prismaMock.order.create.mock.calls[0][0];
    expect(call.data.type).toBe('SERVICE'); // not every item is PRODUCT
    interface ItemCreate {
      itemType: string;
      unitPrice: { toString(): string };
      dealPackage?: { connect: { id: string } };
      therapist?: { connect: { id: string } };
    }
    const items: ItemCreate[] = call.data.items.create;
    expect(items).toHaveLength(3);
    expect(items.find((i) => i.itemType === 'PRODUCT' && !i.dealPackage)!.unitPrice.toString()).toBe('199');
    expect(items.find((i) => i.dealPackage?.connect.id === DEAL_PACKAGE_ID)!.unitPrice.toString()).toBe('299');
    expect(items.find((i) => i.therapist?.connect.id === THERAPIST_ID)!.unitPrice.toString()).toBe('499');
  });
});

describe('GET /api/v1/orders/me/:id — customer isolation', () => {
  it('3. 404s for an order belonging to a different customer', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...orderFixture, customerId: OTHER_CUSTOMER_ID });
    const res = await request(app)
      .get(`/api/v1/orders/me/${ORDER_ID}`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(404);
  });

  it('10/11. returns the order snapshot unchanged, without re-reading Deal, even if the live Deal has since changed', async () => {
    prismaMock.order.findUnique.mockResolvedValue(orderFixture); // stored unitPrice 199.00, from creation time
    const res = await request(app)
      .get(`/api/v1/orders/me/${ORDER_ID}`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(200);
    expect(res.body.data.items[0].unitPrice).toBe('199.00');
    expect(prismaMock.deal.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.deal.findFirst).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/orders/me/:id/status — customer self-cancel', () => {
  it('15. rejects a status other than CANCELLED (customer cannot set arbitrary status)', async () => {
    const res = await request(app)
      .patch(`/api/v1/orders/me/${ORDER_ID}/status`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(422);
  });

  it('16. rejects cancelling a COMPLETED order', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...orderFixture, status: 'COMPLETED' });
    const res = await request(app)
      .patch(`/api/v1/orders/me/${ORDER_ID}/status`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ status: 'CANCELLED' });
    expect(res.status).toBe(409);
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it('cancels a PENDING_PAYMENT order', async () => {
    prismaMock.order.findUnique.mockResolvedValue(orderFixture);
    prismaMock.order.update.mockResolvedValue({ ...orderFixture, status: 'CANCELLED' });
    const res = await request(app)
      .patch(`/api/v1/orders/me/${ORDER_ID}/status`)
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ status: 'CANCELLED', cancellationReason: 'Changed my mind' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
  });
});

describe('GET /api/v1/orders — admin / vendor scoping', () => {
  it('18. returns 403 without orders:view', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app).get('/api/v1/orders').set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(403);
  });

  it('4/17. force-scopes a vendor caller to its own vendorId, ignoring any vendorId query param', async () => {
    resolveMock.mockResolvedValue(['orders:view']);
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_A_ID, ownerUserId: 'vendor-user-1' });
    prismaMock.order.findMany.mockResolvedValue([]);
    prismaMock.order.count.mockResolvedValue(0);
    await request(app)
      .get(`/api/v1/orders?vendorId=${VENDOR_B_ID}`)
      .set('Authorization', bearerFor({ sub: 'vendor-user-1', roles: ['vendor'] }));
    expect(prismaMock.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ items: { some: { vendorId: VENDOR_A_ID } } }) }),
    );
  });

  it('admin (no vendor profile) can filter by an explicit vendorId', async () => {
    resolveMock.mockResolvedValue(['orders:view']);
    prismaMock.vendor.findUnique.mockResolvedValue(null); // caller owns no vendor profile
    prismaMock.order.findMany.mockResolvedValue([]);
    prismaMock.order.count.mockResolvedValue(0);
    await request(app)
      .get(`/api/v1/orders?vendorId=${VENDOR_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(prismaMock.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ items: { some: { vendorId: VENDOR_A_ID } } }) }),
    );
  });

  it("filters a vendor caller's returned items to only their own vendor within a multi-vendor order", async () => {
    resolveMock.mockResolvedValue(['orders:view']);
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_A_ID, ownerUserId: 'vendor-user-1' });
    const multiVendorOrder = {
      ...orderFixture,
      items: [
        orderFixture.items[0],
        { ...orderFixture.items[0], id: 'oi-2', vendorId: VENDOR_B_ID, vendorNameSnapshot: 'XYZ Spa', itemName: 'Hair Serum' },
      ],
    };
    prismaMock.order.findMany.mockResolvedValue([multiVendorOrder]);
    prismaMock.order.count.mockResolvedValue(1);
    const res = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', bearerFor({ sub: 'vendor-user-1', roles: ['vendor'] }));
    expect(res.status).toBe(200);
    expect(res.body.data[0].items).toHaveLength(1);
    expect(res.body.data[0].items[0].vendorId).toBe(VENDOR_A_ID);
  });
});

describe('GET /api/v1/orders/:id — vendor isolation', () => {
  it("4/17. 404s when a vendor requests another vendor's order (never confirms existence)", async () => {
    resolveMock.mockResolvedValue(['orders:view']);
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_B_ID, ownerUserId: 'vendor-user-2' });
    prismaMock.order.findUnique.mockResolvedValue({ ...orderFixture, vendorId: VENDOR_A_ID });
    const res = await request(app)
      .get(`/api/v1/orders/${ORDER_ID}`)
      .set('Authorization', bearerFor({ sub: 'vendor-user-2', roles: ['vendor'] }));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/orders/:id/status — admin', () => {
  // Pre-existing test-order-pollution guard: `vi.clearAllMocks()` (the outer beforeEach) clears
  // call history but NOT a prior test's `.mockResolvedValue()` implementation — a preceding
  // describe block ("GET /api/v1/orders/:id — vendor isolation") leaves
  // `vendor.findUnique` resolved to a vendor fixture, which would otherwise leak into these
  // admin-context tests and make `setOrderStatus` treat 'admin-1' as a vendor caller.
  beforeEach(() => {
    prismaMock.vendor.findUnique.mockResolvedValue(null);
  });

  it('18. returns 403 without orders:status_change', async () => {
    resolveMock.mockResolvedValue(['orders:view']);
    const res = await request(app)
      .patch(`/api/v1/orders/${ORDER_ID}/status`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(403);
  });

  it('confirms a PENDING_PAYMENT order', async () => {
    resolveMock.mockResolvedValue(['orders:status_change']);
    prismaMock.order.findUnique.mockResolvedValue(orderFixture);
    prismaMock.order.update.mockResolvedValue({ ...orderFixture, status: 'CONFIRMED' });
    const res = await request(app)
      .patch(`/api/v1/orders/${ORDER_ID}/status`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CONFIRMED');
  });

  it('rejects an invalid transition (COMPLETED -> CONFIRMED)', async () => {
    resolveMock.mockResolvedValue(['orders:status_change']);
    prismaMock.order.findUnique.mockResolvedValue({ ...orderFixture, status: 'COMPLETED' });
    const res = await request(app)
      .patch(`/api/v1/orders/${ORDER_ID}/status`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(409);
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it('a vendor caller cannot change status on a multi-vendor order — only admin may', async () => {
    resolveMock.mockResolvedValue(['orders:status_change']);
    prismaMock.vendor.findUnique.mockResolvedValue({ id: VENDOR_A_ID, ownerUserId: 'vendor-user-1' });
    prismaMock.order.findUnique.mockResolvedValue({
      ...orderFixture,
      status: 'CONFIRMED',
      items: [orderFixture.items[0], { ...orderFixture.items[0], id: 'oi-2', vendorId: VENDOR_B_ID }],
    });
    const res = await request(app)
      .patch(`/api/v1/orders/${ORDER_ID}/status`)
      .set('Authorization', bearerFor({ sub: 'vendor-user-1', roles: ['vendor'] }))
      .send({ status: 'COMPLETED' });
    expect(res.status).toBe(403);
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });
});
