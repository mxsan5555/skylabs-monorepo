import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BreadcrumbProvider } from '../../../admin/breadcrumb-context';
import { SnackbarHost } from '../../../../snackbar/snackbar';
import { MemberSettlementDetailPage } from './member-settlement-detail';
import type { MemberSettlementDetail } from '../../../../api/rbac/settlements';
import type { Vendor } from '../../../../api/rbac/vendors';

const useAuthMock = vi.fn();
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => useAuthMock() }));

// Full-suite runs under worker-pool load can push jsdom async resolution past testing-library's
// default 1000ms waitFor/findBy timeout even though every assertion here is otherwise correct —
// the same class of flake the pre-existing `deals-list-page.test.tsx` toggle-status tests show
// under full-suite load. Widen the timeout rather than chase a race that isn't actually here.
const LONG = { timeout: 5000 };

const getMemberSettlementDetailMock = vi.fn();
const recordMemberPayoutMock = vi.fn();
const setVendorCommissionRateMock = vi.fn();
vi.mock('../../../../api/rbac/settlements', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/settlements')>('../../../../api/rbac/settlements');
  return {
    ...actual,
    getMemberSettlementDetail: (...args: unknown[]) => getMemberSettlementDetailMock(...args),
    recordMemberPayout: (...args: unknown[]) => recordMemberPayoutMock(...args),
    setVendorCommissionRate: (...args: unknown[]) => setVendorCommissionRateMock(...args),
  };
});

const getVendorMock = vi.fn();
vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return { ...actual, getVendor: (...args: unknown[]) => getVendorMock(...args) };
});

const VENDOR: Vendor = {
  id: 'v1',
  businessName: 'ABC Spa',
  slug: 'abc-spa',
  ownerUserId: 'owner-1',
  commissionRatePercent: null,
  kycStatus: 'VERIFIED',
  kycRejectionReason: null,
  status: 'ACTIVE',
  statusReason: null,
  createdByUserId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  offersService: true,
  offersProduct: true,
  offersTherapy: true,
  owner: { id: 'owner-1', name: 'Priya', status: 'active', roles: [] },
} as unknown as Vendor;

function entitlement(overrides: Partial<MemberSettlementDetail['eligibleItems'][number]> = {}) {
  return {
    id: 'ent-1',
    orderItemId: 'oi-1',
    sequenceNo: 1,
    voucherCode: 'MSD-DL-ABC123',
    customerId: 'cust-1',
    vendorId: 'v1',
    branchId: null,
    fulfilmentKind: 'SERVICE_SESSION',
    entitlementStatus: 'COMPLETED',
    serviceStartedAt: null,
    completedAt: '2026-01-01T00:00:00Z',
    carrier: null,
    trackingNumber: null,
    shippedAt: null,
    deliveryEvidenceStorageKey: null,
    deliveryEvidenceNote: null,
    recordedByUserId: null,
    grossAmount: '1000.00',
    commissionRatePercent: '20.00',
    commissionAmount: '200.00',
    memberShareAmount: '800.00',
    settlementStatus: 'READY_FOR_PAYOUT' as never,
    preDisputeStatus: null,
    holdUntil: '2026-01-02T00:00:00Z',
    payoutItemId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    adjustments: [],
    orderItem: { itemName: 'Deep Tissue Massage', orderId: 'order-1' },
    ...overrides,
  };
}

function detailFixture(overrides: Partial<MemberSettlementDetail> = {}): MemberSettlementDetail {
  return {
    vendor: {
      id: 'v1',
      businessName: 'ABC Spa',
      bankAccountHolder: 'Priya Sharma',
      bankName: 'HDFC Bank',
      bankAccountNumber: '1234567890',
      bankIfsc: 'HDFC0001234',
      upiId: 'priya@upi',
    },
    statement: [entitlement()],
    eligibleItems: [entitlement()],
    payoutHistory: [],
    auditTrail: [],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <BreadcrumbProvider>
      <MemoryRouter initialEntries={['/account/accounts/member-settlements/v1']}>
        <Routes>
          <Route path="/account/accounts/member-settlements/:vendorId" element={<MemberSettlementDetailPage />} />
        </Routes>
      </MemoryRouter>
      <SnackbarHost />
    </BreadcrumbProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getVendorMock.mockResolvedValue({ data: VENDOR });
});

describe('MemberSettlementDetailPage — loading/error/empty states', () => {
  it('shows a loading state before the data resolves', () => {
    getMemberSettlementDetailMock.mockReturnValue(new Promise(() => {}));
    useAuthMock.mockReturnValue({ token: 'tok', can: () => true, bootstrap: { roles: [{ isSuperAdmin: true }] } });
    renderPage();
    expect(screen.getByText(/Loading member settlement/)).toBeTruthy();
  });

  it('shows an error state when the detail fails to load', async () => {
    getMemberSettlementDetailMock.mockRejectedValue(new Error('network down'));
    useAuthMock.mockReturnValue({ token: 'tok', can: () => true, bootstrap: { roles: [{ isSuperAdmin: true }] } });
    renderPage();
    expect(await screen.findByRole('alert', {}, LONG)).toBeTruthy();
  });

  it('shows empty-state copy when there is nothing eligible and no statement/payout/audit rows yet', async () => {
    getMemberSettlementDetailMock.mockResolvedValue({
      data: detailFixture({ statement: [], eligibleItems: [], payoutHistory: [], auditTrail: [] }),
    });
    useAuthMock.mockReturnValue({ token: 'tok', can: () => true, bootstrap: { roles: [{ isSuperAdmin: true }] } });
    renderPage();
    expect(await screen.findByText('Nothing is eligible for payout right now.', {}, LONG)).toBeTruthy();
    expect(screen.getByText('No vouchers yet for this member.')).toBeTruthy();
    expect(screen.getByText('No payouts recorded yet.')).toBeTruthy();
    expect(screen.getByText('No payout audit entries yet.')).toBeTruthy();
  });
});

/**
 * Feature: "Record Bank Payment" is double-gated client-side (approve permission AND
 * isSuperAdmin), matching the server's double-gated route — this is the money-movement action,
 * so every combination short of BOTH must hide the button entirely, never just disable it.
 */
describe('MemberSettlementDetailPage — Record Bank Payment permission gating', () => {
  it('hides the Record Bank Payment button for an admin holding approve but NOT flagged isSuperAdmin', async () => {
    getMemberSettlementDetailMock.mockResolvedValue({ data: detailFixture() });
    useAuthMock.mockReturnValue({
      token: 'tok',
      can: (key: string, action: string) => key === 'accounts.member-settlements' && action === 'approve',
      bootstrap: { roles: [{ isSuperAdmin: false }] },
    });
    renderPage();
    await screen.findByText(/Ready for payout/, {}, LONG);
    expect(screen.queryByText('Record Bank Payment')).toBeNull();
    expect(screen.getByText('Recording a payout is restricted to a SuperAdmin.')).toBeTruthy();
  });

  it('hides the button for a super_admin who somehow lacks the approve permission', async () => {
    getMemberSettlementDetailMock.mockResolvedValue({ data: detailFixture() });
    useAuthMock.mockReturnValue({
      token: 'tok',
      can: () => false,
      bootstrap: { roles: [{ isSuperAdmin: true }] },
    });
    renderPage();
    await screen.findByText(/Ready for payout/, {}, LONG);
    expect(screen.queryByText('Record Bank Payment')).toBeNull();
  });

  it('shows the button for a super_admin holding approve, and disables it when bank details are incomplete', async () => {
    getMemberSettlementDetailMock.mockResolvedValue({
      data: detailFixture({ vendor: { id: 'v1', businessName: 'ABC Spa', bankAccountHolder: null, bankName: null, bankAccountNumber: null, bankIfsc: null, upiId: null } }),
    });
    useAuthMock.mockReturnValue({
      token: 'tok',
      can: (key: string, action: string) => key === 'accounts.member-settlements' && (action === 'approve' || action === 'status_change'),
      bootstrap: { roles: [{ isSuperAdmin: true }] },
    });
    renderPage();
    const button = await screen.findByText('Record Bank Payment', {}, LONG);
    expect(button.closest('button, [disabled]') ?? button).toBeTruthy();
    expect(screen.getByText(/Bank details are incomplete/)).toBeTruthy();
  });

  it('a super_admin holding approve, with complete bank details, can select an item and record a payout', async () => {
    getMemberSettlementDetailMock.mockResolvedValue({ data: detailFixture() });
    recordMemberPayoutMock.mockResolvedValue({ data: { id: 'payout-1' } });
    useAuthMock.mockReturnValue({
      token: 'tok',
      can: (key: string, action: string) => key === 'accounts.member-settlements' && (action === 'approve' || action === 'status_change'),
      bootstrap: { roles: [{ isSuperAdmin: true }] },
    });
    renderPage();

    const checkbox = await screen.findByLabelText('Select voucher MSD-DL-ABC123', {}, LONG);
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByText('Record Bank Payment'));
    fireEvent.click(screen.getByText('Record Payment'));

    await waitFor(
      () =>
        expect(recordMemberPayoutMock).toHaveBeenCalledWith(
          'tok',
          'v1',
          expect.objectContaining({ entitlementIds: ['ent-1'] }),
        ),
      LONG,
    );
  });
});

describe('MemberSettlementDetailPage — commission override visibility', () => {
  it('hides the commission Edit action for a caller without status_change', async () => {
    getMemberSettlementDetailMock.mockResolvedValue({ data: detailFixture() });
    useAuthMock.mockReturnValue({ token: 'tok', can: () => false, bootstrap: { roles: [{ isSuperAdmin: false }] } });
    renderPage();
    await screen.findByText('ABC Spa', {}, LONG);
    expect(screen.queryByText('Edit')).toBeNull();
  });
});
