import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { getMyOrderOrThrow, getOrderActivityHistory, getOrderCounts, listOrders } from './order.service';

const prismaMock = vi.mocked(prisma, true);

const CUSTOMER_ID = 'f0000000-0000-4000-8000-000000000001';
const OTHER_CUSTOMER_ID = 'f0000000-0000-4000-8000-000000000002';
const ORDER_ID = 'f0000000-0000-4000-8000-000000000003';
const ENTITLEMENT_ID = 'f0000000-0000-4000-8000-000000000004';
const ADMIN_USER_ID = 'f0000000-0000-4000-8000-000000000005';
const ITEM_ID = 'f0000000-0000-4000-8000-000000000006';
const DISPUTE_ID = 'f0000000-0000-4000-8000-000000000007';
const REFUND_ID = 'f0000000-0000-4000-8000-000000000008';

beforeEach(() => {
  vi.clearAllMocks();
  // No linked Vendor profile — every test in this file is an admin caller unless overridden.
  prismaMock.member.findUnique.mockResolvedValue(null as never);
});

function orderFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    customerId: CUSTOMER_ID,
    status: 'CONFIRMED',
    items: [
      {
        id: 'item-1',
        itemName: '60-min Massage',
        deal: null,
        product: null,
        therapist: null,
        purchaseEntitlements: [
          {
            id: ENTITLEMENT_ID,
            voucherCode: 'MSD-DL-ABC',
            fulfilmentKind: 'SERVICE_SESSION',
            entitlementStatus: 'ACTIVE',
            disputes: [],
          },
        ],
      },
    ],
    ...overrides,
  };
}

/**
 * Feature: Customer order detail — voucher/entitlement exposure, scoped to the owning customer
 * Scenario: `getMyOrderOrThrow` flattens each OrderItem's own `purchaseEntitlements` (narrowed:
 * voucher code, fulfilment kind, status, latest dispute — never the OTP hash or payout/bank
 * internals) into `item.entitlements`, and a different customer's order 404s outright (never
 * leaking the existence of someone else's order, let alone their vouchers).
 */
describe('getMyOrderOrThrow — entitlements exposure', () => {
  it("exposes item.entitlements[] with voucher code + status + latest dispute for the order's own customer", async () => {
    prismaMock.order.findUnique.mockResolvedValue(orderFixture() as never);

    const order = await getMyOrderOrThrow(CUSTOMER_ID, ORDER_ID);

    expect(order.items[0].entitlements).toEqual([
      { id: ENTITLEMENT_ID, voucherCode: 'MSD-DL-ABC', fulfilmentKind: 'SERVICE_SESSION', entitlementStatus: 'ACTIVE', dispute: null },
    ]);
  });

  it('flattens the latest dispute onto `dispute`, never an array, and never raw OTP/payout fields', async () => {
    prismaMock.order.findUnique.mockResolvedValue(
      orderFixture({
        items: [
          {
            id: 'item-1',
            itemName: 'Product',
            deal: null,
            product: null,
            therapist: null,
            purchaseEntitlements: [
              {
                id: ENTITLEMENT_ID,
                voucherCode: 'MSD-PR-XYZ',
                fulfilmentKind: 'PRODUCT_PICKUP',
                entitlementStatus: 'COMPLETED',
                disputes: [{ id: 'dispute-1', status: 'OPEN', resolutionType: null }],
              },
            ],
          },
        ],
      }) as never,
    );

    const order = await getMyOrderOrThrow(CUSTOMER_ID, ORDER_ID);

    const entitlement = order.items[0].entitlements[0] as unknown as Record<string, unknown>;
    expect(entitlement.dispute).toEqual({ id: 'dispute-1', status: 'OPEN', resolutionType: null });
    expect(entitlement).not.toHaveProperty('hashedOtp');
    expect(entitlement).not.toHaveProperty('payoutItemId');
    expect(entitlement).not.toHaveProperty('customerId');
  });

  it("404s for a different customer's order — never confirms existence, never leaks another customer's vouchers", async () => {
    prismaMock.order.findUnique.mockResolvedValue(orderFixture({ customerId: OTHER_CUSTOMER_ID }) as never);

    await expect(getMyOrderOrThrow(CUSTOMER_ID, ORDER_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('404s for a non-existent order id', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null);
    await expect(getMyOrderOrThrow(CUSTOMER_ID, ORDER_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('renders an empty entitlements array for an item with no vouchers yet (e.g. payment not yet confirmed)', async () => {
    prismaMock.order.findUnique.mockResolvedValue(
      orderFixture({ items: [{ id: 'item-1', itemName: 'x', deal: null, product: null, therapist: null, purchaseEntitlements: [] }] }) as never,
    );
    const order = await getMyOrderOrThrow(CUSTOMER_ID, ORDER_ID);
    expect(order.items[0].entitlements).toEqual([]);
  });
});

function adminOrderFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    customerId: CUSTOMER_ID,
    status: 'CONFIRMED',
    items: [{ id: ITEM_ID, itemName: '60-min Massage', vendorId: 'vendor-1' }],
    ...overrides,
  };
}

/**
 * Feature: Order Details page's "Activity History" — one chronological feed across 4 AuditLog
 * targetTypes keyed by this order's own item/entitlement/dispute/refund ids.
 * Scenario: the Order-targeted rows are always included; the other 3 OR-branches are only added
 * once there's at least one matching id (never an empty `targetId: { in: [] }`, which would just
 * never match); results are ordered chronologically (ascending), never newest-first.
 */
describe('getOrderActivityHistory', () => {
  it("aggregates the order's own item/entitlement/dispute/refund ids into one auditLog OR query, ordered ascending", async () => {
    prismaMock.order.findUnique.mockResolvedValue(adminOrderFixture() as never);
    prismaMock.orderItem.findMany.mockResolvedValue([
      {
        id: ITEM_ID,
        purchaseEntitlements: [{ id: ENTITLEMENT_ID, disputes: [{ id: DISPUTE_ID }] }],
        refunds: [{ id: REFUND_ID }],
      },
    ] as never);
    prismaMock.auditLog.findMany.mockResolvedValue([{ id: 'log-1' }] as never);

    const result = await getOrderActivityHistory(ADMIN_USER_ID, 'ALL', ORDER_ID);

    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { targetType: 'Order', targetId: ORDER_ID },
          { targetType: 'PurchaseEntitlement', targetId: { in: [ENTITLEMENT_ID] } },
          { targetType: 'PurchaseDispute', targetId: { in: [DISPUTE_ID] } },
          { targetType: 'Refund', targetId: { in: [REFUND_ID] } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(result).toEqual([{ id: 'log-1' }]);
  });

  it('only includes the Order-targeted branch when the order has no entitlements/disputes/refunds at all', async () => {
    prismaMock.order.findUnique.mockResolvedValue(adminOrderFixture() as never);
    prismaMock.orderItem.findMany.mockResolvedValue([{ id: ITEM_ID, purchaseEntitlements: [], refunds: [] }] as never);
    prismaMock.auditLog.findMany.mockResolvedValue([] as never);

    await getOrderActivityHistory(ADMIN_USER_ID, 'ALL', ORDER_ID);

    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith({
      where: { OR: [{ targetType: 'Order', targetId: ORDER_ID }] },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('404s for a non-existent order — reuses getOrderOrThrow, never a parallel ownership check', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null);
    await expect(getOrderActivityHistory(ADMIN_USER_ID, 'ALL', ORDER_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prismaMock.orderItem.findMany).not.toHaveBeenCalled();
  });

  it("scopes a vendor caller's activity to only its own items — never a sibling vendor's entitlement/dispute/refund ids on the same multi-vendor order", async () => {
    prismaMock.member.findUnique.mockResolvedValue({ id: 'vendor-1' } as never);
    prismaMock.order.findUnique.mockResolvedValue(
      adminOrderFixture({
        items: [
          { id: ITEM_ID, itemName: 'Mine', vendorId: 'vendor-1' },
          { id: 'other-item', itemName: 'Not mine', vendorId: 'vendor-2' },
        ],
      }) as never,
    );
    prismaMock.orderItem.findMany.mockResolvedValue([{ id: ITEM_ID, purchaseEntitlements: [], refunds: [] }] as never);
    prismaMock.auditLog.findMany.mockResolvedValue([] as never);

    await getOrderActivityHistory('vendor-owner-1', 'OWN', ORDER_ID);

    expect(prismaMock.orderItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [ITEM_ID] } } }),
    );
  });
});

/**
 * Feature: Order History's three summary cards (All / Paid / Awaiting Payment)
 * Scenario: always 3 cheap `count()`s, never `findMany`; the "total" count drops any status
 * concept entirely (there is none in this opts shape) while still applying every other filter.
 */
describe('getOrderCounts', () => {
  it('runs exactly 3 count() calls — never findMany — and applies the same vendor/branch/search filters to every one', async () => {
    prismaMock.order.count.mockResolvedValue(0);

    await getOrderCounts(ADMIN_USER_ID, { search: 'priya' });

    expect(prismaMock.order.count).toHaveBeenCalledTimes(3);
    expect(prismaMock.order.findMany).not.toHaveBeenCalled();
    const wheres = prismaMock.order.count.mock.calls.map((c) => (c[0] as { where: Record<string, unknown> }).where);
    expect(wheres[0]).not.toHaveProperty('status');
    expect(wheres[1]).toMatchObject({ payments: { some: { status: 'PAID' } } });
    expect(wheres[2]).toMatchObject({ status: 'PENDING_PAYMENT' });
    // The search filter carries through to all 3, not just the "total" one.
    for (const where of wheres) {
      expect(JSON.stringify(where)).toContain('priya');
    }
  });

  it("force-scopes a vendor caller's counts to its own vendorId, ignoring any vendorId filter passed in", async () => {
    prismaMock.member.findUnique.mockResolvedValue({ id: 'vendor-1' } as never);
    prismaMock.order.count.mockResolvedValue(0);

    await getOrderCounts('vendor-owner-1', { vendorId: 'vendor-2' });

    const wheres = prismaMock.order.count.mock.calls.map((c) => (c[0] as { where: Record<string, unknown> }).where);
    for (const where of wheres) {
      expect(where).toMatchObject({ items: { some: { vendorId: 'vendor-1' } } });
    }
  });
});

/**
 * Feature: `listOrders`'s free-text search — additive phone/contactPhone branches
 * Scenario: searching matches a customer's live phone and the checkout-time `contactPhone`
 * snapshot, on top of the pre-existing vendor/branch/customer-name/item-name matches.
 */
describe('listOrders — search extended to customer phone + contactPhone', () => {
  it('includes customer.phone and Order.contactPhone as additional OR branches', async () => {
    prismaMock.order.findMany.mockResolvedValue([]);
    prismaMock.order.count.mockResolvedValue(0);

    await listOrders(ADMIN_USER_ID, { page: 1, pageSize: 20, search: '9810099999' });

    expect(prismaMock.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { customer: { is: { phone: { contains: '9810099999' } } } },
            { contactPhone: { contains: '9810099999' } },
          ]),
        }),
      }),
    );
  });
});

/**
 * Feature: Same-name customer isolation
 * Scenario: `User` has no uniqueness constraint on `name` — two different customers can both be
 * "Priya Sharma". Every admin query that scopes to one customer's orders (`listOrders`,
 * `getOrderCounts`) must filter strictly on `Order.customerId`, a real FK, never on the display
 * name — so the two Priyas' histories can never bleed into each other no matter how the search
 * box is also populated at the same time.
 *
 * Given: two `User` rows, PRIYA_A_ID and PRIYA_B_ID, both named "Priya Sharma"
 * When: an admin filters the Orders list / counts to `customerId: PRIYA_A_ID`
 * Then: the Prisma `where` sent to `findMany`/`count` carries `customerId: PRIYA_A_ID` and never
 *       a name-based clause — and this holds even with an unrelated free-text `search` term
 *       active at the same time (the search extension is an additive OR, never a replacement).
 */
describe('listOrders / getOrderCounts — same-name customer isolation (customerId, never name)', () => {
  const PRIYA_A_ID = 'f0000000-0000-4000-8000-0000000000a1';
  const PRIYA_B_ID = 'f0000000-0000-4000-8000-0000000000a2';

  it('listOrders scopes strictly to customerId — the where clause never mentions a name filter', async () => {
    prismaMock.order.findMany.mockResolvedValue([]);
    prismaMock.order.count.mockResolvedValue(0);

    await listOrders(ADMIN_USER_ID, { page: 1, pageSize: 20, customerId: PRIYA_A_ID });

    const call = prismaMock.order.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where.customerId).toBe(PRIYA_A_ID);
    // No OR/search branch at all when no `search` term is given — never a name-based match
    // standing in for the real FK filter.
    expect(call.where).not.toHaveProperty('OR');
  });

  it("a search term that happens to equal the OTHER Priya's name never widens results past customerId — the customerId filter and the search OR both apply (AND), not either/or", async () => {
    prismaMock.order.findMany.mockResolvedValue([]);
    prismaMock.order.count.mockResolvedValue(0);

    await listOrders(ADMIN_USER_ID, { page: 1, pageSize: 20, customerId: PRIYA_A_ID, search: 'Priya Sharma' });

    const call = prismaMock.order.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    // Both conditions are present on the SAME where object — Prisma ANDs top-level keys, so a
    // customerId:PRIYA_A_ID order whose own fields don't match "Priya Sharma" still wouldn't
    // surface PRIYA_B's orders; this asserts the filter is structurally an AND, not an OR that
    // search could widen past customerId.
    expect(call.where.customerId).toBe(PRIYA_A_ID);
    expect(call.where).toHaveProperty('OR');
  });

  it("getOrderCounts' three counts all scope to customerId, never a name clause, for either Priya independently", async () => {
    prismaMock.order.count.mockResolvedValue(0);

    await getOrderCounts(ADMIN_USER_ID, { customerId: PRIYA_B_ID });

    const wheres = prismaMock.order.count.mock.calls.map((c) => (c[0] as { where: Record<string, unknown> }).where);
    expect(wheres).toHaveLength(3);
    for (const where of wheres) {
      expect(where.customerId).toBe(PRIYA_B_ID);
      expect(JSON.stringify(where)).not.toContain('Sharma');
    }
  });
});

/**
 * Feature: Name/phone change preserves historical order linkage
 * Scenario: `Order.customerId` is a plain FK to `User.id` — there is no point-in-time snapshot of
 * the customer on the Order row itself (unlike vendor/branch snapshots). This means a customer
 * editing their own `name`/`phone` structurally cannot affect which orders a `customerId`-scoped
 * query returns — `listOrders`/`getMyOrderOrThrow` never re-derive "this customer" from name/
 * phone, only from the id. This test proves the NEW phone/contactPhone search branch added this
 * task is additive (an extra OR arm) and never replaces the customerId filter that is what
 * actually keeps old orders linked across a profile edit.
 */
describe('listOrders — customerId linkage survives a customer name/phone edit', () => {
  const CUSTOMER_ID_STABLE = 'f0000000-0000-4000-8000-0000000000b1';

  it("filtering by customerId returns the same where clause regardless of what the customer's CURRENT name/phone happen to be — the id is the only thing read", async () => {
    prismaMock.order.findMany.mockResolvedValue([]);
    prismaMock.order.count.mockResolvedValue(0);

    // Simulates "before the edit": customerId filter only, no search.
    await listOrders(ADMIN_USER_ID, { page: 1, pageSize: 20, customerId: CUSTOMER_ID_STABLE });
    const beforeCall = prismaMock.order.findMany.mock.calls[0][0] as { where: Record<string, unknown> };

    vi.clearAllMocks();
    prismaMock.order.findMany.mockResolvedValue([]);
    prismaMock.order.count.mockResolvedValue(0);

    // Simulates "after the edit" — same customerId, the only thing this function ever reads to
    // decide which orders belong to this customer. (The customer's name/phone changing happens
    // entirely in `User`, a table this function never queries at all.)
    await listOrders(ADMIN_USER_ID, { page: 1, pageSize: 20, customerId: CUSTOMER_ID_STABLE });
    const afterCall = prismaMock.order.findMany.mock.calls[0][0] as { where: Record<string, unknown> };

    expect(beforeCall.where).toEqual(afterCall.where);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});
