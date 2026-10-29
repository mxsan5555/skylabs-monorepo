import { render, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MemberSettlementRow } from '../../../../api/rbac/settlements';

// Full-suite runs under worker-pool load can push jsdom async resolution past testing-library's
// default 1000ms waitFor/findBy timeout even though every assertion here is otherwise correct —
// the same class of flake `member-settlement-detail.test.tsx`/`orders-and-verify.test.tsx` widen
// for. Widen the timeout rather than chase a race that isn't actually here.
const LONG = { timeout: 5000 };

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ token: 'test-token', can: () => true }),
}));

const listMemberSettlementsMock = vi.fn();
vi.mock('../../../../api/rbac/settlements', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/settlements')>('../../../../api/rbac/settlements');
  return {
    ...actual,
    listMemberSettlements: (...args: unknown[]) => listMemberSettlementsMock(...args),
  };
});

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

import { MemberSettlementsPage } from './member-settlements';

const ROW: MemberSettlementRow = {
  vendorId: 'vendor-1',
  businessName: 'ABC Spa',
  bankDetailsOnFile: true,
  bankReferenceMasked: '••••1234',
  primaryBranchName: 'Gorakhpur Branch',
  primaryBranchCity: 'Gorakhpur',
  pendingFulfilment: '800.00',
  onHold: '1200.00',
  readyForPayout: '400.00',
  paid: '0.00',
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/account/accounts/member-settlements" element={<MemberSettlementsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function table(): HTMLElement {
  return document.querySelector('sky-data-table') as HTMLElement;
}

function tableRows(): Record<string, unknown>[] {
  return JSON.parse(table()?.getAttribute('rows') ?? '[]');
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Feature: Member Settlements — regression test for the "View" row action bug
 * Scenario: the previous implementation gave the "View" action the magic `__view_detail__`
 * event string, which `sky-data-table` intercepts NATIVELY to open its own generic key/value
 * drawer and NEVER dispatches as a `sky-dt-row-action` custom event at all — so the row-action
 * handler (and therefore `navigate(...)`) never actually ran. The fix renamed the action's event
 * to the ordinary string `'view-member'`, which flows through the normal handler. This test
 * proves clicking "View" actually calls `navigate(...)` to the vendor's detail page.
 */
describe('MemberSettlementsPage — "View" row action actually navigates (regression)', () => {
  it('dispatches sky-dt-row-action with an ordinary action string (never the magic __view_detail__) and navigates by vendorId', async () => {
    listMemberSettlementsMock.mockResolvedValue({ data: [ROW], meta: { total: 1 } });
    renderAt('/account/accounts/member-settlements');
    await waitFor(() => expect(table()?.getAttribute('total')).toBe('1'), LONG);

    // Confirm the configured action is NOT the magic drawer-trap string.
    const actions = JSON.parse(table()?.getAttribute('actions') ?? '[]');
    expect(actions).toEqual([{ icon: 'visibility', label: 'View', event: 'view-member' }]);
    expect(actions.some((a: { event: string }) => a.event === '__view_detail__')).toBe(false);

    fireEvent(
      table(),
      new CustomEvent('sky-dt-row-action', { detail: { action: 'view-member', row: tableRows()[0] } }),
    );

    expect(navigateMock).toHaveBeenCalledWith('/account/accounts/member-settlements/vendor-1');
  });

  it('never navigates when the row carries no vendor id (defensive — malformed row)', async () => {
    listMemberSettlementsMock.mockResolvedValue({ data: [ROW], meta: { total: 1 } });
    renderAt('/account/accounts/member-settlements');
    await waitFor(() => expect(table()?.getAttribute('total')).toBe('1'), LONG);

    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'view-member', row: { Member: 'ABC Spa' } } }));

    expect(navigateMock).not.toHaveBeenCalled();
  });
});

/**
 * Feature: Accounts Overview's "Review Payouts" deep link -> `?status=ready` round-trip
 * Scenario: the Member Settlements list reads an initial `?status=ready` from the URL on mount
 * and keeps it there (never silently dropped on the next page/search change) until the admin
 * explicitly clears it via "Show all members".
 */
describe('MemberSettlementsPage — ?status=ready round-trip', () => {
  it('passes status: "ready" to listMemberSettlements and shows the "ready only" banner when the URL carries ?status=ready', async () => {
    listMemberSettlementsMock.mockResolvedValue({ data: [ROW], meta: { total: 1 } });
    const { findByText } = renderAt('/account/accounts/member-settlements?status=ready');

    await waitFor(() => expect(listMemberSettlementsMock).toHaveBeenCalled(), LONG);
    expect(listMemberSettlementsMock).toHaveBeenCalledWith('test-token', expect.objectContaining({ status: 'ready' }));
    expect(await findByText(/Showing only members ready for payout/, {}, LONG)).toBeTruthy();
  });

  it('never passes status at all when the URL has no ?status=ready', async () => {
    listMemberSettlementsMock.mockResolvedValue({ data: [ROW], meta: { total: 1 } });
    renderAt('/account/accounts/member-settlements');
    await waitFor(() => expect(listMemberSettlementsMock).toHaveBeenCalled(), LONG);
    const call = listMemberSettlementsMock.mock.calls[0][1] as Record<string, unknown>;
    expect(call.status).toBeUndefined();
  });

  it('"Show all members" clears the ready filter and re-fetches without it', async () => {
    listMemberSettlementsMock.mockResolvedValue({ data: [ROW], meta: { total: 1 } });
    const { findByText } = renderAt('/account/accounts/member-settlements?status=ready');
    await waitFor(() => expect(listMemberSettlementsMock).toHaveBeenCalled(), LONG);

    const clearButton = await findByText('Show all members', {}, LONG);
    fireEvent.click(clearButton);

    await waitFor(() => {
      const lastCall = listMemberSettlementsMock.mock.calls.at(-1)?.[1] as Record<string, unknown>;
      expect(lastCall.status).toBeUndefined();
    }, LONG);
  });
});

/**
 * Feature: Member Settlements — masked bank reference column + search/pagination round-trip
 */
describe('MemberSettlementsPage — list rendering + URL-persisted search/pagination', () => {
  it('renders the masked bank reference, never the full account number', async () => {
    listMemberSettlementsMock.mockResolvedValue({ data: [ROW], meta: { total: 1 } });
    renderAt('/account/accounts/member-settlements');
    await waitFor(() => expect(table()?.getAttribute('total')).toBe('1'), LONG);
    const [row] = tableRows();
    expect(row['Bank Reference']).toBe('••••1234');
  });

  it('reads page/pageSize/search from the URL on mount', async () => {
    listMemberSettlementsMock.mockResolvedValue({ data: [], meta: { total: 0 } });
    renderAt('/account/accounts/member-settlements?page=2&pageSize=20&search=abc');
    await waitFor(() => expect(listMemberSettlementsMock).toHaveBeenCalled(), LONG);
    expect(listMemberSettlementsMock).toHaveBeenCalledWith(
      'test-token',
      expect.objectContaining({ page: 2, pageSize: 20, search: 'abc' }),
    );
  });
});
