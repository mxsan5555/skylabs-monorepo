import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { Prisma } from '../generated/prisma-client';
import {
  getOverallSummary,
  getVendorWiseReport,
  getMonthWiseReport,
  getServiceVsProductReport,
  getPaymentMethodReport,
  getTopProducts,
} from './reports.service';

const prismaMock = vi.mocked(prisma, true);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getOverallSummary', () => {
  it('computes totalRevenue from Order.total and paidRevenue from PAID Payment.amount separately', async () => {
    prismaMock.order.count.mockResolvedValueOnce(10).mockResolvedValueOnce(2).mockResolvedValueOnce(5);
    prismaMock.order.aggregate
      .mockResolvedValueOnce({ _sum: { total: new Prisma.Decimal('50000') } } as never)
      .mockResolvedValueOnce({ _sum: { total: new Prisma.Decimal('8000') } } as never);
    prismaMock.orderItem.aggregate
      .mockResolvedValueOnce({ _sum: { quantity: 40 } } as never)
      .mockResolvedValueOnce({ _sum: { quantity: 12 } } as never);
    prismaMock.payment.aggregate.mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal('42000') } } as never);

    const result = await getOverallSummary({});

    expect(result.totalOrders).toBe(10);
    expect(result.cancelledOrders).toBe(2);
    expect(result.completedOrders).toBe(5);
    expect(result.totalRevenue).toBe('50000');
    expect(result.paidRevenue).toBe('42000'); // distinct from totalRevenue — money actually collected
    expect(result.pendingAmount).toBe('8000');
    expect(result.totalProductsSold).toBe(40);
    expect(result.totalServicesBooked).toBe(12);
  });

  it('defaults every sum to "0" when there is no matching data at all, never throws on a null aggregate', async () => {
    prismaMock.order.count.mockResolvedValue(0);
    prismaMock.order.aggregate.mockResolvedValue({ _sum: { total: null } } as never);
    prismaMock.orderItem.aggregate.mockResolvedValue({ _sum: { quantity: null } } as never);
    prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);

    const result = await getOverallSummary({ vendorId: 'v-none' });

    expect(result.totalRevenue).toBe('0');
    expect(result.paidRevenue).toBe('0');
    expect(result.pendingAmount).toBe('0');
    expect(result.totalProductsSold).toBe(0);
  });
});

describe('getVendorWiseReport', () => {
  it('dedupes distinct orders per vendor from (vendorId, orderId) groupBy rows, summing revenue correctly', async () => {
    // Vendor A appears in 2 different orders (2 line items, different orders) — should count as
    // orders: 2, revenue: sum of both lines. Vendor B appears twice in the SAME order (2 line
    // items in one order) — should count as orders: 1, revenue: sum of both lines.
    prismaMock.orderItem.groupBy.mockResolvedValue([
      { vendorId: 'vendor-a', orderId: 'order-1', _sum: { lineTotal: new Prisma.Decimal('100') } },
      { vendorId: 'vendor-a', orderId: 'order-2', _sum: { lineTotal: new Prisma.Decimal('200') } },
      { vendorId: 'vendor-b', orderId: 'order-3', _sum: { lineTotal: new Prisma.Decimal('50') } },
    ] as never);
    prismaMock.order.findMany.mockResolvedValue([
      { id: 'order-1', status: 'CONFIRMED', vendorNameSnapshot: 'A' },
      { id: 'order-2', status: 'PENDING_PAYMENT', vendorNameSnapshot: 'A' },
      { id: 'order-3', status: 'CANCELLED', vendorNameSnapshot: 'B' },
    ] as never);
    prismaMock.payment.findMany.mockResolvedValue([{ orderId: 'order-1', amount: new Prisma.Decimal('100') }] as never);
    prismaMock.vendor.findMany.mockResolvedValue([
      { id: 'vendor-a', businessName: 'Vendor A' },
      { id: 'vendor-b', businessName: 'Vendor B' },
    ] as never);

    const result = await getVendorWiseReport({});
    const vendorA = result.find((r) => r.vendorId === 'vendor-a')!;
    const vendorB = result.find((r) => r.vendorId === 'vendor-b')!;

    expect(vendorA.orders).toBe(2);
    expect(vendorA.revenue).toBe('300');
    expect(vendorA.pending).toBe('200'); // order-2 is PENDING_PAYMENT
    expect(vendorB.orders).toBe(1);
    expect(vendorB.cancelled).toBe(1);
  });

  it('returns an empty array with no extra queries when there are no matching order items', async () => {
    prismaMock.orderItem.groupBy.mockResolvedValue([]);
    const result = await getVendorWiseReport({ vendorId: 'nobody' });
    expect(result).toEqual([]);
    expect(prismaMock.order.findMany).not.toHaveBeenCalled();
  });
});

describe('getMonthWiseReport', () => {
  it('buckets orders and items by calendar month (UTC)', async () => {
    prismaMock.order.findMany.mockResolvedValue([
      { id: 'o1', createdAt: new Date('2026-01-15T00:00:00.000Z'), total: new Prisma.Decimal('100') },
      { id: 'o2', createdAt: new Date('2026-02-01T00:00:00.000Z'), total: new Prisma.Decimal('200') },
    ] as never);
    prismaMock.orderItem.findMany.mockResolvedValue([
      { orderId: 'o1', itemType: 'PRODUCT', quantity: 3, order: { createdAt: new Date('2026-01-15T00:00:00.000Z') } },
      { orderId: 'o2', itemType: 'SERVICE', quantity: 1, order: { createdAt: new Date('2026-02-01T00:00:00.000Z') } },
    ] as never);

    const result = await getMonthWiseReport({});

    expect(result).toEqual([
      { month: '2026-01', orders: 1, revenue: '100', services: 0, products: 3 },
      { month: '2026-02', orders: 1, revenue: '200', services: 1, products: 0 },
    ]);
  });
});

describe('getServiceVsProductReport', () => {
  it('sums quantity and revenue separately for SERVICE vs PRODUCT line items', async () => {
    prismaMock.orderItem.aggregate
      .mockResolvedValueOnce({ _sum: { quantity: 20, lineTotal: new Prisma.Decimal('9000') } } as never)
      .mockResolvedValueOnce({ _sum: { quantity: 55, lineTotal: new Prisma.Decimal('15000') } } as never);

    const result = await getServiceVsProductReport({});

    expect(result).toEqual({
      servicesSold: 20,
      productsSold: 55,
      serviceRevenue: '9000',
      productRevenue: '15000',
    });
  });
});

describe('getPaymentMethodReport', () => {
  it('groups by provider, classifying PAID/CREATED/FAILED-or-CANCELLED into successful/pending/failed', async () => {
    prismaMock.payment.groupBy.mockResolvedValue([
      { provider: 'RAZORPAY', status: 'PAID', _sum: { amount: new Prisma.Decimal('5000') }, _count: { _all: 5 } },
      { provider: 'RAZORPAY', status: 'FAILED', _sum: { amount: new Prisma.Decimal('0') }, _count: { _all: 2 } },
      { provider: 'COD', status: 'CREATED', _sum: { amount: new Prisma.Decimal('0') }, _count: { _all: 3 } },
    ] as never);

    const result = await getPaymentMethodReport({});
    const razorpay = result.find((r) => r.provider === 'RAZORPAY')!;
    const cod = result.find((r) => r.provider === 'COD')!;

    expect(razorpay.orders).toBe(7);
    expect(razorpay.successful).toBe(5);
    expect(razorpay.failed).toBe(2);
    expect(razorpay.revenue).toBe('5000');
    expect(cod.pending).toBe(3);
  });
});

describe('getTopProducts', () => {
  it('resolves display name/vendor from a representative OrderItem snapshot per dealId', async () => {
    prismaMock.orderItem.groupBy.mockResolvedValue([
      { dealId: 'deal-1', _sum: { quantity: 30, lineTotal: new Prisma.Decimal('6000') } },
    ] as never);
    prismaMock.orderItem.findMany.mockResolvedValue([
      { dealId: 'deal-1', itemName: 'Hair Shampoo', vendorNameSnapshot: 'Glow Beauty Studio' },
    ] as never);

    const result = await getTopProducts({}, 10);

    expect(result).toEqual([
      { dealId: 'deal-1', itemName: 'Hair Shampoo', vendorName: 'Glow Beauty Studio', quantitySold: 30, revenue: '6000' },
    ]);
  });
});
