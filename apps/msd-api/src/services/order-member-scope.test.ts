import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma-client';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});
vi.mock('./vendor.service', () => ({ getVendorByOwnerUserId: vi.fn() }));

import { prisma } from '../lib/prisma';
import { getVendorByOwnerUserId } from './vendor.service';
import { getOrderOrThrow, listOrders } from './order.service';
import { getDashboardStats } from './dashboard.service';

const prismaMock = vi.mocked(prisma, true);
const ALOK = 'member-alok';
const RAVI = 'member-ravi';
const D = (v: string) => new Prisma.Decimal(v);

/** Neeraj bought from both members in one order; Ravi is the order's "primary" vendor. */
const SHARED_ORDER = {
  id: 'order-1',
  customerId: 'neeraj',
  vendorId: RAVI,
  branchId: 'branch-ravi',
  vendorNameSnapshot: 'Ravi Singh Spa',
  branchNameSnapshot: 'Mumbai Main',
  subtotal: D('5000.00'),
  total: D('5000.00'),
  status: 'CONFIRMED',
  vendor: { id: RAVI, businessName: 'Ravi Singh Spa' },
  branch: { id: 'branch-ravi', name: 'Mumbai Main', address: '6 Block', city: 'Mumbai' },
  customer: { id: 'neeraj', name: 'Neeraj Singh', phone: '+919177889991', email: 'neeraj@test.com' },
  payments: [{ id: 'pay-1', status: 'PAID', provider: 'RAZORPAY', amount: D('5000.00'), currency: 'INR', failureReason: null, createdAt: new Date() }],
  items: [
    { id: 'i-ravi', vendorId: RAVI, vendorNameSnapshot: 'Ravi Singh Spa', branchId: 'branch-ravi', branchNameSnapshot: 'Mumbai Main', itemName: 'Hot Stone', lineTotal: D('3800.00') },
    { id: 'i-alok', vendorId: ALOK, vendorNameSnapshot: 'Alok Kumar Wellness', branchId: 'branch-alok', branchNameSnapshot: 'Delhi K Pocket', itemName: 'Head Massage', lineTotal: D('1200.00') },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getVendorByOwnerUserId).mockResolvedValue({ id: ALOK } as never);
  prismaMock.order.findMany.mockResolvedValue([SHARED_ORDER] as never);
  prismaMock.order.count.mockResolvedValue(1);
  prismaMock.order.findUnique.mockResolvedValue(SHARED_ORDER as never);
});

/** Item 5: a member sees only their own part of a shared order, never another member's data. */
describe('member order scope', () => {
  it('lists a shared order with only their items, their own total, vendor, branch and payment share', async () => {
    const { items } = await listOrders('alok-user', 'OWN', { page: 1, pageSize: 20 });
    const order = items[0] as typeof SHARED_ORDER;
    expect(order.items.map((i) => i.id)).toEqual(['i-alok']);
    expect(order.total.toString()).toBe('1200');
    expect(order.subtotal.toString()).toBe('1200');
    expect(order.vendorId).toBe(ALOK);
    expect(order.vendorNameSnapshot).toBe('Alok Kumar Wellness');
    expect(order.vendor).toEqual({ id: ALOK, businessName: 'Alok Kumar Wellness' });
    expect(order.branchId).toBe('branch-alok');
    expect(order.branchNameSnapshot).toBe('Delhi K Pocket');
    expect(order.branch).toBeNull();
    expect(order.payments[0].amount.toString()).toBe('1200');
    expect(JSON.stringify(order)).not.toMatch(/Ravi|Hot Stone|5000|3800|Mumbai/);
  });

  it('applies the same scope to one order, and 404s an order without their items', async () => {
    const order = (await getOrderOrThrow('alok-user', 'OWN', 'order-1')) as typeof SHARED_ORDER;
    expect(order.total.toString()).toBe('1200');
    expect(JSON.stringify(order)).not.toMatch(/Ravi Singh Spa|Hot Stone/);

    prismaMock.order.findUnique.mockResolvedValue({ ...SHARED_ORDER, items: [SHARED_ORDER.items[0]] } as never);
    await expect(getOrderOrThrow('alok-user', 'OWN', 'order-1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('searches only their own item names and the customer name', async () => {
    await listOrders('alok-user', 'OWN', { page: 1, pageSize: 20, search: 'Hot Stone' });
    const where = prismaMock.order.findMany.mock.calls[0][0]?.where as { OR: unknown[] };
    expect(JSON.stringify(where.OR)).not.toContain('vendorNameSnapshot');
    for (const clause of where.OR as Record<string, { some?: { vendorId?: string } }>[]) {
      if (clause.items) expect(clause.items.some?.vendorId).toBe(ALOK);
    }
  });

  it('leaves admin results whole', async () => {
    vi.mocked(getVendorByOwnerUserId).mockResolvedValue(null);
    const { items } = await listOrders('admin-user', 'ALL', { page: 1, pageSize: 20 });
    expect((items[0] as typeof SHARED_ORDER).total.toString()).toBe('5000');
    expect((items[0] as typeof SHARED_ORDER).items).toHaveLength(2);
  });
});

describe('member dashboard revenue', () => {
  it('sums only their own paid lines, never the whole payment', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ id: ALOK } as never);
    for (const model of ['branch', 'product', 'deal', 'order', 'therapist'] as const) {
      (prismaMock[model].count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    }
    prismaMock.order.findMany.mockResolvedValue([]);
    prismaMock.deal.findMany.mockResolvedValue([]);
    prismaMock.product.findMany.mockResolvedValue([]);
    prismaMock.therapist.findMany.mockResolvedValue([]);
    prismaMock.orderItem.aggregate.mockResolvedValue({ _sum: { lineTotal: D('1200.00') } } as never);
    prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: D('5000.00') } } as never);

    const stats = await getDashboardStats('alok-user');
    expect(String((stats as { revenue?: string }).revenue)).toBe('1200');
    expect(prismaMock.orderItem.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ vendorId: ALOK }) }),
    );
  });
});
