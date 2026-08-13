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
const PRODUCT_DEAL_ID = 'e0e0e0e0-0000-4000-8000-000000000005';
const SERVICE_DEAL_ID = 'f0f0f0f0-0000-4000-8000-000000000006';
const VENDOR_A_ID = 'a1a1a1a1-0000-4000-8000-000000000007';
const VENDOR_B_ID = 'a2a2a2a2-0000-4000-8000-000000000008';
const BRANCH_A_ID = 'a3a3a3a3-0000-4000-8000-000000000009';
const BOOKING_ID = 'a4a4a4a4-0000-4000-8000-00000000000a';
const ORDER_ID = 'a5a5a5a5-0000-4000-8000-00000000000b';

const vendorAFixture = { id: VENDOR_A_ID, businessName: 'ABC Salon', status: 'ACTIVE' };
const branchAFixture = { id: BRANCH_A_ID, name: 'Gorakhpur Branch', isActive: true };

const cartWithOneItem = {
  id: CART_ID,
  customerId: CUSTOMER_ID,
  vendorId: VENDOR_A_ID,
  branchId: BRANCH_A_ID,
  items: [{ id: CART_ITEM_ID, cartId: CART_ID, dealId: PRODUCT_DEAL_ID, quantity: 2, unitPrice: '150.00' }], // stale unitPrice — live deal price is 199.00
};

const productDealFixture = {
  id: PRODUCT_DEAL_ID,
  productId: 'prod-1',
  serviceId: null,
  vendorId: VENDOR_A_ID,
  branchId: BRANCH_A_ID,
  salePrice: '199.00', // the live, current price — must be what's used, not the stale cart snapshot of 150.00
  product: { name: 'Face Cream' },
};

const serviceDealFixture = {
  id: SERVICE_DEAL_ID,
  serviceId: 'svc-1',
  productId: null,
  vendorId: VENDOR_A_ID,
  branchId: BRANCH_A_ID,
  service: { name: 'Haircut' },
  title: 'Haircut deal',
};

const bookingFixture = {
  id: BOOKING_ID,
  customerId: CUSTOMER_ID,
  dealId: SERVICE_DEAL_ID,
  vendorId: VENDOR_A_ID,
  branchId: BRANCH_A_ID,
  status: 'PENDING',
  quantity: 1,
  priceSnapshot: '299.00',
  durationMinutesSnapshot: 30,
  deal: serviceDealFixture,
  vendor: vendorAFixture,
  branch: branchAFixture,
};

const orderFixture = {
  id: ORDER_ID,
  customerId: CUSTOMER_ID,
  vendorId: VENDOR_A_ID,
  branchId: BRANCH_A_ID,
  type: 'PRODUCT',
  status: 'PENDING_PAYMENT',
  vendorNameSnapshot: 'ABC Salon',
  branchNameSnapshot: 'Gorakhpur Branch',
  subtotal: '398.00',
  total: '398.00',
  items: [{ id: 'oi-1', dealId: PRODUCT_DEAL_ID, itemName: 'Face Cream', itemType: 'PRODUCT', unitPrice: '199.00', quantity: 2, lineTotal: '398.00', durationMinutes: null }],
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe('POST /api/v1/orders/checkout — Product Cart -> Order', () => {
  it('1. creates a PRODUCT order from the cart', async () => {
    prismaMock.cart.findUnique.mockResolvedValue(cartWithOneItem);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.deal.findFirst.mockResolvedValue(productDealFixture);
    prismaMock.order.create.mockResolvedValue(orderFixture);
    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe('PRODUCT');
  });

  it('8/9. snapshots vendor/branch name at creation time', async () => {
    prismaMock.cart.findUnique.mockResolvedValue(cartWithOneItem);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.deal.findFirst.mockResolvedValue(productDealFixture);
    prismaMock.order.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: ORDER_ID, ...data }));
    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(201);
    expect(prismaMock.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ vendorNameSnapshot: 'ABC Salon', branchNameSnapshot: 'Gorakhpur Branch' }) }),
    );
  });

  it('19. recalculates price server-side from the LIVE deal price, never the stale CartItem.unitPrice', async () => {
    prismaMock.cart.findUnique.mockResolvedValue(cartWithOneItem); // cart item unitPrice snapshot: 150.00 (stale)
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.deal.findFirst.mockResolvedValue(productDealFixture); // live price: 199.00
    prismaMock.order.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: ORDER_ID, ...data }));
    await request(app).post('/api/v1/orders/checkout').set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    const call = prismaMock.order.create.mock.calls[0][0];
    const itemCreate = call.data.items.create[0];
    expect(itemCreate.unitPrice.toString()).toBe('199');
    expect(call.data.subtotal.toString()).toBe('398'); // 199 * qty(2), not 150 * 2 = 300
  });

  it('12. clears cart items only after the order is successfully created', async () => {
    prismaMock.cart.findUnique.mockResolvedValue(cartWithOneItem);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.deal.findFirst.mockResolvedValue(productDealFixture);
    prismaMock.order.create.mockResolvedValue(orderFixture);
    await request(app).post('/api/v1/orders/checkout').set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(prismaMock.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: CART_ID } });
    expect(prismaMock.cart.update).toHaveBeenCalledWith({ where: { id: CART_ID }, data: { vendorId: null, branchId: null } });
  });

  it('13/20. leaves the cart intact and creates nothing when a deal fails revalidation (transaction rollback)', async () => {
    prismaMock.cart.findUnique.mockResolvedValue(cartWithOneItem);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.deal.findFirst.mockResolvedValue(null); // deal went inactive/unapproved since being added to cart
    const res = await request(app).post('/api/v1/orders/checkout').set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(409);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
    expect(prismaMock.cartItem.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.cart.update).not.toHaveBeenCalled();
  });

  it('rejects checkout of an empty cart', async () => {
    prismaMock.cart.findUnique.mockResolvedValue({ ...cartWithOneItem, items: [], vendorId: null, branchId: null });
    const res = await request(app).post('/api/v1/orders/checkout').set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(422);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('stores the checkout "Customer Details" step contact/shipping fields on the order', async () => {
    prismaMock.cart.findUnique.mockResolvedValue(cartWithOneItem);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.deal.findFirst.mockResolvedValue(productDealFixture);
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

describe('POST /api/v1/orders/from-booking — Service Booking -> Order', () => {
  it('2. creates a SERVICE order from a booking', async () => {
    prismaMock.booking.findUnique.mockResolvedValue(bookingFixture);
    prismaMock.order.findUnique.mockResolvedValue(null); // no existing order for this booking
    prismaMock.order.create.mockResolvedValue({ ...orderFixture, type: 'SERVICE', bookingId: BOOKING_ID });
    const res = await request(app)
      .post('/api/v1/orders/from-booking')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ bookingId: BOOKING_ID });
    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe('SERVICE');
  });

  it('7. snapshots duration from the booking (never re-reads Deal)', async () => {
    prismaMock.booking.findUnique.mockResolvedValue(bookingFixture);
    prismaMock.order.findUnique.mockResolvedValue(null);
    prismaMock.order.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: ORDER_ID, ...data }));
    await request(app)
      .post('/api/v1/orders/from-booking')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ bookingId: BOOKING_ID });
    const call = prismaMock.order.create.mock.calls[0][0];
    expect(call.data.items.create[0].durationMinutes).toBe(30);
    expect(call.data.items.create[0].unitPrice.toString()).toBe('299');
    expect(prismaMock.deal.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.deal.findUnique).not.toHaveBeenCalled();
  });

  it('14. rejects creating a second order from the same booking', async () => {
    prismaMock.booking.findUnique.mockResolvedValue(bookingFixture);
    prismaMock.order.findUnique.mockResolvedValue({ id: 'existing-order', bookingId: BOOKING_ID });
    const res = await request(app)
      .post('/api/v1/orders/from-booking')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ bookingId: BOOKING_ID });
    expect(res.status).toBe(409);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('rejects a booking that is already CANCELLED', async () => {
    prismaMock.booking.findUnique.mockResolvedValue({ ...bookingFixture, status: 'CANCELLED' });
    const res = await request(app)
      .post('/api/v1/orders/from-booking')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ bookingId: BOOKING_ID });
    expect(res.status).toBe(409);
  });

  it("3. 404s for another customer's booking (customer isolation)", async () => {
    prismaMock.booking.findUnique.mockResolvedValue({ ...bookingFixture, customerId: OTHER_CUSTOMER_ID });
    const res = await request(app)
      .post('/api/v1/orders/from-booking')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }))
      .send({ bookingId: BOOKING_ID });
    expect(res.status).toBe(404);
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
    expect(prismaMock.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ vendorId: VENDOR_A_ID }) }));
  });

  it('admin (no vendor profile) can filter by an explicit vendorId', async () => {
    resolveMock.mockResolvedValue(['orders:view']);
    prismaMock.vendor.findUnique.mockResolvedValue(null); // caller owns no vendor profile
    prismaMock.order.findMany.mockResolvedValue([]);
    prismaMock.order.count.mockResolvedValue(0);
    await request(app)
      .get(`/api/v1/orders?vendorId=${VENDOR_A_ID}`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(prismaMock.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ vendorId: VENDOR_A_ID }) }));
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
});
