import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import type { Prisma } from '../generated/prisma-client';

/**
 * Deal stock and per-customer limits (docs/msd/PLANNING.md §2.7). Stock is `Deal.maxBookings`
 * minus units in paid orders; nothing is reserved while an order waits for payment, so checkout
 * checks again.
 */

const PAID_STATUSES = ['CONFIRMED', 'COMPLETED'] as const;

type Db = Prisma.TransactionClient | typeof prisma;

/** Units of `dealId` in paid orders, optionally for one customer. */
export async function paidUnits(dealId: string, customerId?: string, db: Db = prisma): Promise<number> {
  const result = await db.orderItem.aggregate({
    where: { dealId, order: { status: { in: [...PAID_STATUSES] }, ...(customerId ? { customerId } : {}) } },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}

/** Paid units per deal id, for lists (one query). */
export async function paidUnitsByDeal(dealIds: string[]): Promise<Map<string, number>> {
  if (dealIds.length === 0) return new Map();
  const groups = await prisma.orderItem.groupBy({
    by: ['dealId'],
    where: { dealId: { in: dealIds }, order: { status: { in: [...PAID_STATUSES] } } },
    _sum: { quantity: true },
  });
  return new Map(groups.map((g) => [g.dealId as string, g._sum.quantity ?? 0]));
}

/** Units left, or null when the deal has no stock limit. */
export function stockLeft(maxBookings: number | null | undefined, sold: number): number | null {
  return maxBookings == null ? null : Math.max(0, maxBookings - sold);
}

/** True when the deal has a stock or per-customer limit worth checking. */
export function hasPurchaseLimits(deal: { maxBookings?: number | null; limitPerCustomer?: number | null }): boolean {
  return deal.maxBookings != null || deal.limitPerCustomer != null;
}

/**
 * Throws 409 `DEAL_SOLD_OUT` or `DEAL_LIMIT_REACHED` when `quantity` units of the deal (the
 * customer's whole cart total for it, not one line) would pass the stock or the per-customer
 * limit.
 */
export async function assertDealPurchasable(
  deal: { id: string; maxBookings?: number | null; limitPerCustomer?: number | null },
  customerId: string,
  quantity: number,
  db: Db = prisma,
): Promise<void> {
  if (deal.maxBookings != null) {
    const left = stockLeft(deal.maxBookings, await paidUnits(deal.id, undefined, db)) ?? 0;
    if (quantity > left) {
      throw new ApiError('DEAL_SOLD_OUT', left === 0 ? 'This deal is sold out' : `Only ${left} left for this deal`, { left });
    }
  }
  if (deal.limitPerCustomer != null) {
    const allowed = deal.limitPerCustomer - (await paidUnits(deal.id, customerId, db));
    if (quantity > allowed) {
      throw new ApiError('DEAL_LIMIT_REACHED', `You can buy up to ${deal.limitPerCustomer} of this deal`, {
        limit: deal.limitPerCustomer,
        allowed: Math.max(0, allowed),
      });
    }
  }
}
