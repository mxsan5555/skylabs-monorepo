import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { clearHotCache, getHotIds } from './catalog.service';

const prismaMock = vi.mocked(prisma, true);

describe('getHotIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearHotCache();
  });

  it('counts order lines only when an order has a paid payment', async () => {
    prismaMock.orderItem.groupBy.mockResolvedValue([
      { dealId: 'paid-deal', _count: { _all: 6 } },
    ] as never);

    await expect(getHotIds('deal', new Date('2026-10-24T12:00:00Z'))).resolves.toEqual(['paid-deal']);

    const groupBy = prismaMock.orderItem.groupBy.mock.calls[0][0] as unknown as {
      where: {
        order: {
          status: { in: string[] };
          payments: { some: { status: string } };
        };
      };
    };
    expect(groupBy.where.order.status.in).toEqual(['CONFIRMED', 'COMPLETED']);
    expect(groupBy.where.order.payments.some.status).toBe('PAID');
  });
});
