import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { Prisma } from '../generated/prisma-client';
import { getAccountsOverview } from './settlement.service';
import { getDisputeAttentionSummary } from './dispute.service';

const prismaMock = vi.mocked(prisma, true);

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Feature: Accounts Overview's "On Hold" bucket vs. the "Refunds & disputes attention" tile —
 * no double-counting, no drifting definitions
 * Scenario: the approved plan requires `getDisputeAttentionSummary`'s `blockedAmount` to use the
 * EXACT SAME "payable" formula (`memberShareAmount` + adjustments) that `getAccountsOverview`
 * already folds into `onHold` for every `DISPUTED_BLOCKED` entitlement — never a second, parallel
 * definition that could silently drift from the first. This test runs ONE shared fixture through
 * BOTH real service functions and proves the DISPUTED_BLOCKED slice of `onHold` is numerically
 * IDENTICAL to `disputeAttention.blockedAmount` — not just independently "correct" in isolation.
 *
 * Given: a shared fixture of 4 entitlements — two ON_HOLD (non-disputed), two DISPUTED_BLOCKED
 *        (one with a negative adjustment)
 * When: getAccountsOverview() and getDisputeAttentionSummary() both run against this same data
 * Then: overview.onHold minus the known ON_HOLD-only amount equals exactly
 *       disputeAttention.blockedAmount — i.e. the disputed amount is counted ONCE, inside onHold,
 *       and getDisputeAttentionSummary reports that exact same number back out, never a second
 *       total that could differ from what's actually inside onHold.
 */
describe('getAccountsOverview.onHold vs getDisputeAttentionSummary.blockedAmount — shared fixture, no drift', () => {
  it('the DISPUTED_BLOCKED slice of onHold is numerically identical to blockedAmount', async () => {
    // ON_HOLD (not disputed) — contributes to onHold only.
    const onHoldOnly = [
      { grossAmount: new Prisma.Decimal('1000.00'), commissionAmount: new Prisma.Decimal('100.00'), memberShareAmount: new Prisma.Decimal('900.00'), settlementStatus: 'ON_HOLD', adjustments: [] },
      { grossAmount: new Prisma.Decimal('200.00'), commissionAmount: new Prisma.Decimal('20.00'), memberShareAmount: new Prisma.Decimal('180.00'), settlementStatus: 'ON_HOLD', adjustments: [] },
    ];
    // DISPUTED_BLOCKED — contributes to BOTH onHold (via getAccountsOverview) and blockedAmount
    // (via getDisputeAttentionSummary) — these two numbers must reconcile exactly.
    const disputedBlocked = [
      { grossAmount: new Prisma.Decimal('500.00'), commissionAmount: new Prisma.Decimal('50.00'), memberShareAmount: new Prisma.Decimal('300.00'), settlementStatus: 'DISPUTED_BLOCKED', adjustments: [] },
      { grossAmount: new Prisma.Decimal('300.00'), commissionAmount: new Prisma.Decimal('30.00'), memberShareAmount: new Prisma.Decimal('150.00'), settlementStatus: 'DISPUTED_BLOCKED', adjustments: [{ amount: new Prisma.Decimal('-50.00') }] },
    ];
    const allEntitlements = [...onHoldOnly, ...disputedBlocked];

    // getAccountsOverview's "all" read (no where, no distinct) — the full set.
    prismaMock.purchaseEntitlement.findMany.mockImplementation((args: unknown) => {
      const a = (args ?? {}) as { where?: { settlementStatus?: string }; distinct?: string[] };
      if (a.distinct) return Promise.resolve([] as never); // readyForPayout-eligible vendors — irrelevant here
      if (a.where?.settlementStatus === 'DISPUTED_BLOCKED') return Promise.resolve(disputedBlocked as never); // dispute.service's own read
      return Promise.resolve(allEntitlements as never); // getAccountsOverview's unfiltered "all" read
    });
    prismaMock.purchaseEntitlement.aggregate.mockResolvedValue({ _sum: { memberShareAmount: null } } as never);
    prismaMock.purchaseDispute.count.mockResolvedValue(2);

    const overview = await getAccountsOverview();
    const disputeAttention = await getDisputeAttentionSummary();

    // Known ON_HOLD-only amount, computed independently of either service function, to isolate
    // "how much of onHold is the disputed slice."
    const onHoldOnlyAmount = new Prisma.Decimal('900.00').add('180.00'); // 1080.00
    const disputedSliceOfOnHold = overview.onHold.sub(onHoldOnlyAmount);

    expect(disputedSliceOfOnHold.toFixed(2)).toBe('400.00'); // 300 + (150 - 50)
    expect(disputeAttention.blockedAmount.toFixed(2)).toBe('400.00');
    // The actual cross-check the plan asks for: these two independently-computed numbers, from
    // two different service files, reconcile EXACTLY for the same underlying data.
    expect(disputedSliceOfOnHold.toFixed(2)).toBe(disputeAttention.blockedAmount.toFixed(2));
    expect(disputeAttention.openCount).toBe(2);
  });
});
