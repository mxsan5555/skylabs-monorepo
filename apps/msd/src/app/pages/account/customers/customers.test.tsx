import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToastProvider } from '../../../../toast/toast-context';
import type { Customer } from '../../../../api/rbac/customers';
import { ApiRequestError } from '../../../../api/rbac/client';

let grantedPermissions: Set<string>;

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({
    token: 'test-token',
    can: (menuKey: string, action = 'view') => grantedPermissions.has(`${menuKey}:${action}`),
  }),
}));

const listCustomersMock = vi.fn();
const getCustomerMock = vi.fn();
const setCustomerStatusMock = vi.fn();

vi.mock('../../../../api/rbac/customers', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/customers')>('../../../../api/rbac/customers');
  return {
    ...actual,
    listCustomers: (...args: unknown[]) => listCustomersMock(...args),
    getCustomer: (...args: unknown[]) => getCustomerMock(...args),
    setCustomerStatus: (...args: unknown[]) => setCustomerStatusMock(...args),
  };
});

import { CustomerManagement } from './customers';

const CUSTOMER: Customer = {
  id: 'customer-1',
  name: 'Priya Sharma',
  phone: '+919876543210',
  email: 'priya@example.com',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  _count: { orders: 3 },
};

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <CustomerManagement />
      </MemoryRouter>
    </ToastProvider>,
  );
}

function table(): HTMLElement {
  const el = document.querySelector('sky-data-table');
  if (!el) throw new Error('sky-data-table not found');
  return el as HTMLElement;
}

async function waitForTableLoaded(expectedTotal: number): Promise<void> {
  await waitFor(() => expect(table().getAttribute('total')).toBe(String(expectedTotal)));
}

/** Same self-healing retry as blog-list.test.tsx's own `dispatchRowActionUntil` — the row-action
 *  listener re-subscribes (keyed on `[onStatusChange]`/customers state) slightly after the table's
 *  own `total` attribute commits, so the very first dispatch can race a stale/empty listener. */
async function dispatchRowActionUntil(action: string, row: Record<string, unknown>, assert: () => void): Promise<void> {
  await waitFor(() => {
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action, row } }));
    assert();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  grantedPermissions = new Set(['customers:view', 'customers:status_change']);
  listCustomersMock.mockResolvedValue({ data: [CUSTOMER], meta: { total: 1 } });
  getCustomerMock.mockResolvedValue({ data: CUSTOMER });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Feature: Customer Management — status-change confirm/API/toast flow
 * Scenario: `doStatusChange` confirms via `window.confirm`, calls `setCustomerStatus`, updates
 * local state only on success (never optimistically), and shows a success/error toast — same
 * `blog-list.tsx#toggleStatus` pattern this codebase already uses elsewhere.
 *
 * Given: a SuperAdmin/staff viewing the Customer directory with `customers:status_change`
 * When: a status-change row action fires
 * Then: window.confirm gates the call; a confirmed call updates the table/detail and shows a
 *       success toast; a cancelled confirm never calls the API; a failed API call shows an error
 *       toast and leaves the displayed status unchanged
 *
 * Edge cases:
 * - a caller without `customers:status_change` sees no status-change actions (covered by
 *   customer-list.test.tsx's own canChangeStatus suite; re-verified here at the container level
 *   via the rendered actions attribute)
 */
describe('CustomerManagement — status change', () => {
  it('renders the customer list from listCustomers', async () => {
    renderPage();
    await waitForTableLoaded(1);
    expect(listCustomersMock).toHaveBeenCalledWith('test-token', expect.objectContaining({ page: 1, pageSize: 10 }));
    expect(table().getAttribute('rows')).toContain('Priya Sharma');
  });

  it('gates the status-change actions on customers:status_change', async () => {
    grantedPermissions = new Set(['customers:view']); // no status_change
    renderPage();
    await waitForTableLoaded(1);
    const actions = JSON.parse(table().getAttribute('actions') ?? '[]') as { event: string }[];
    expect(actions.map((a) => a.event)).toEqual(['select']);
  });

  it('confirms via window.confirm, then calls setCustomerStatus and shows a success toast', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    setCustomerStatusMock.mockResolvedValue({ data: { ...CUSTOMER, status: 'blocked' } });
    renderPage();
    await waitForTableLoaded(1);

    await dispatchRowActionUntil('suspend', { 'Customer ID': CUSTOMER.id, 'Customer Status': 'active' }, () => {
      expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to suspend this customer?');
    });

    await waitFor(() => expect(setCustomerStatusMock).toHaveBeenCalledWith('test-token', CUSTOMER.id, 'blocked'));
    expect(await screen.findByText('Customer suspended.')).toBeTruthy();
  });

  it('does NOT call setCustomerStatus when window.confirm is cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    await waitForTableLoaded(1);

    await dispatchRowActionUntil('suspend', { 'Customer ID': CUSTOMER.id, 'Customer Status': 'active' }, () => {
      expect(confirmSpy).toHaveBeenCalled();
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(setCustomerStatusMock).not.toHaveBeenCalled();
  });

  it('a failed status-change call shows an error toast and never changes the displayed status', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    setCustomerStatusMock.mockRejectedValue(new ApiRequestError('CONFLICT', 'Could not change status.', 409));
    renderPage();
    await waitForTableLoaded(1);

    await dispatchRowActionUntil('suspend', { 'Customer ID': CUSTOMER.id, 'Customer Status': 'active' }, () => {
      expect(setCustomerStatusMock).toHaveBeenCalled();
    });

    expect(await screen.findByText('Could not change status.')).toBeTruthy();
    // Still showing the original active-derived row — never optimistically flipped to Suspended.
    const rows = JSON.parse(table().getAttribute('rows') ?? '[]') as { Status: string }[];
    expect(rows[0].Status).toBe('Active');
  });
});
