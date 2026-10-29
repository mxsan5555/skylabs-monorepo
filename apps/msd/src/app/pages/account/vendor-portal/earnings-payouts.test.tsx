import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MemberSettlementDetail, PurchaseEntitlement } from '../../../../api/rbac/settlements';

/**
 * Feature: Member "Earnings & Payouts" (`earnings-payouts.tsx`) — reworked to `sky-data-table` +
 * the "Service Pending" card rename. No test coverage existed for this page before this task
 * even though it was changed; this covers the empty states, the renamed card, and the
 * statement row's "Open" action routing to the resumable verification page.
 *
 * Given: the member's settlement detail has loaded (or 403s, or has zero statement/payout rows)
 * When: the page renders
 * Then: "Service Pending" (not the old "Pending Fulfilment") is the first card's title, empty
 *       states read exactly "No vouchers yet." / "No payouts received yet.", and the statement
 *       table's "Open" action navigates to `/account/vendor-orders/verify/:voucherCode`
 *
 * Edge cases:
 * - zero statement rows -> "No vouchers yet." (table not rendered)
 * - zero payout history -> "No payouts received yet."
 * - a 403 (member not yet granted the settlements permission) shows the documented grant-request
 *   copy, never a raw error
 */

const LONG = { timeout: 5000 };

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => ({ token: 'tok' }) }));

const getMyVendorMock = vi.fn();
vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return { ...actual, getMyVendor: (...args: unknown[]) => getMyVendorMock(...args) };
});

const getMemberSettlementDetailMock = vi.fn();
vi.mock('../../../../api/rbac/settlements', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/settlements')>('../../../../api/rbac/settlements');
  return { ...actual, getMemberSettlementDetail: (...args: unknown[]) => getMemberSettlementDetailMock(...args) };
});

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

import { EarningsPayouts } from './earnings-payouts';
import { ApiRequestError } from '../../../../api/rbac/client';

function entitlement(overrides: Partial<PurchaseEntitlement> = {}): PurchaseEntitlement {
  return {
    id: 'ent-1',
    orderItemId: 'item-1',
    sequenceNo: 1,
    voucherCode: 'MSD-DL-ABC123',
    customerId: 'cust-1',
    vendorId: 'vendor-1',
    branchId: null,
    fulfilmentKind: 'SERVICE_SESSION',
    entitlementStatus: 'ACTIVE',
    serviceStartedAt: null,
    completedAt: null,
    carrier: null,
    trackingNumber: null,
    shippedAt: null,
    deliveryEvidenceStorageKey: null,
    deliveryEvidenceNote: null,
    recordedByUserId: null,
    grossAmount: '1000.00',
    commissionRatePercent: '10',
    commissionAmount: '100.00',
    memberShareAmount: '900.00',
    settlementStatus: 'PENDING_FULFILMENT',
    preDisputeStatus: null,
    holdUntil: null,
    payoutItemId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    adjustments: [],
    orderItem: { itemName: 'Deep Tissue Massage', orderId: 'order-1' },
    ...overrides,
  };
}

function detailFixture(overrides: Partial<MemberSettlementDetail> = {}): MemberSettlementDetail {
  return {
    vendor: { id: 'vendor-1', businessName: 'Zen Spa', bankAccountHolder: null, bankName: null, bankAccountNumber: null, bankIfsc: null, upiId: null },
    statement: [],
    eligibleItems: [],
    payoutHistory: [],
    auditTrail: [],
    ...overrides,
  };
}

function tableRows(): Record<string, unknown>[] {
  const table = document.querySelector('sky-data-table');
  return JSON.parse(table?.getAttribute('rows') ?? '[]');
}

beforeEach(() => {
  vi.clearAllMocks();
  getMyVendorMock.mockResolvedValue({ data: { id: 'vendor-1' } });
});

describe('EarningsPayouts — card rename + empty states', () => {
  it('renders "Service Pending" (not the old "Pending Fulfilment") as the first stat card title', async () => {
    getMemberSettlementDetailMock.mockResolvedValue({ data: detailFixture() });
    render(<EarningsPayouts />);
    expect(await screen.findByText('Service Pending', {}, LONG)).toBeTruthy();
    expect(screen.queryByText('Pending Fulfilment')).toBeNull();
  });

  it('shows "No vouchers yet." when the statement is empty — no table rendered', async () => {
    getMemberSettlementDetailMock.mockResolvedValue({ data: detailFixture() });
    render(<EarningsPayouts />);
    expect(await screen.findByText('No vouchers yet.', {}, LONG)).toBeTruthy();
    expect(document.querySelector('sky-data-table')).toBeNull();
  });

  it('shows "No payouts received yet." when payout history is empty', async () => {
    getMemberSettlementDetailMock.mockResolvedValue({ data: detailFixture() });
    render(<EarningsPayouts />);
    expect(await screen.findByText('No payouts received yet.', {}, LONG)).toBeTruthy();
  });

  it('shows the documented grant-request copy (never a raw error) on a 403', async () => {
    getMemberSettlementDetailMock.mockRejectedValue(new ApiRequestError('FORBIDDEN', 'Forbidden', 403));
    render(<EarningsPayouts />);
    expect(await screen.findByText(/doesn.t have access to earnings data yet/, {}, LONG)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a generic error state for a non-403 failure', async () => {
    getMemberSettlementDetailMock.mockRejectedValue(new Error('network down'));
    render(<EarningsPayouts />);
    expect(await screen.findByRole('alert', {}, LONG)).toBeTruthy();
  });
});

describe('EarningsPayouts — statement table + "Open" action', () => {
  it('renders one statement row per entitlement with My Share computed via payable()', async () => {
    getMemberSettlementDetailMock.mockResolvedValue({ data: detailFixture({ statement: [entitlement()] }) });
    render(<EarningsPayouts />);
    await waitFor(() => expect(tableRows().length).toBe(1), LONG);
    const [row] = tableRows();
    expect(row.Purchase).toBe('Deep Tissue Massage');
    expect(row['My Share']).toBe('₹900');
    expect(row.__voucherCode).toBe('MSD-DL-ABC123');
  });

  // KNOWN BUG, caught by this test (reported — not fixed here per QA process; see
  // `earnings-payouts.tsx:125-136`): the `sky-dt-row-action` listener is attached inside a
  // `useEffect` keyed only on `[navigate]` (line 136), but `tableRef.current` is still `null` the
  // first time that effect runs — the `<sky-data-table>` itself is rendered conditionally, only
  // once `detail.statement.length > 0` (i.e. after the async `load()` resolves), so on mount the
  // effect sees `el === null` and returns immediately. Nothing re-runs it once the table actually
  // appears (the dependency array has nothing that changes when `detail` loads), so the listener
  // is never attached to the real element — clicking "Open" on any statement row silently does
  // nothing in production. This test intentionally asserts the CORRECT behaviour and is expected
  // to fail until that effect is fixed (e.g. add `detail` to its dependency array, or attach via
  // a ref callback instead of an effect).
  it('clicking "Open" on a statement row navigates to the verify route for that voucher', async () => {
    getMemberSettlementDetailMock.mockResolvedValue({ data: detailFixture({ statement: [entitlement({ voucherCode: 'MSD-DL-XYZ999' })] }) });
    render(<EarningsPayouts />);
    await waitFor(() => expect(tableRows().length).toBe(1), LONG);

    const table = document.querySelector('sky-data-table') as Element;
    fireEvent(table, new CustomEvent('sky-dt-row-action', { detail: { action: 'open-voucher', row: tableRows()[0] } }));

    expect(navigateMock).toHaveBeenCalledWith('/account/vendor-orders/verify/MSD-DL-XYZ999');
  });

  it('never renders a payout-release/record-payment action — read-only for the member', async () => {
    getMemberSettlementDetailMock.mockResolvedValue({ data: detailFixture({ statement: [entitlement()] }) });
    render(<EarningsPayouts />);
    await waitFor(() => expect(tableRows().length).toBe(1), LONG);
    const actions = JSON.parse(document.querySelector('sky-data-table')?.getAttribute('actions') ?? '[]');
    expect(actions).toEqual([{ icon: 'arrow_forward', label: 'Open', event: 'open-voucher' }]);
  });
});
