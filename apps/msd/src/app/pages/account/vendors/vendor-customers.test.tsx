import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CustomerRow } from '../../../../api/rbac/vendors';

/**
 * Feature: Vendor Customers list — "View" action fix
 * Scenario: the "View" row action used to fire the magic `__view_detail__` event string, which
 * `sky-data-table` intercepts natively to open its own generic key/value drawer — it never
 * reached application code as a `sky-dt-row-action` event, so clicking "View" never navigated
 * anywhere. Fixed to a real `view-customer` event, now navigating to the new
 * `/account/vendor-customers/:customerId` detail page (same fix shape already applied to
 * `orders.tsx`'s "View" and `member-settlements.tsx`'s "View").
 *
 * Given: the Customers list has loaded at least one row
 * When: "View" is clicked (dispatched as `sky-dt-row-action` with `action: 'view-customer'`)
 * Then: the page navigates to `/account/vendor-customers/:customerId` for that row — a real
 *       navigation, never the native generic drawer
 *
 * Edge cases:
 * - an action event with a different action name is ignored (no navigation)
 * - an empty customer list renders zero rows, not an error
 */

const LONG = { timeout: 5000 };

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => ({ token: 'tok' }) }));

const listMyCustomersMock = vi.fn();
vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return { ...actual, listMyCustomers: (...args: unknown[]) => listMyCustomersMock(...args) };
});

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

import { VendorCustomers } from './vendor-customers';

function customerRow(overrides: Partial<CustomerRow> = {}): CustomerRow {
  return {
    id: 'cust-1',
    name: 'Priya Rao',
    phone: '+919876543210',
    email: 'priya@example.com',
    orderCount: 3,
    lastActivityAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function tableRows(): Record<string, unknown>[] {
  const table = document.querySelector('sky-data-table');
  return JSON.parse(table?.getAttribute('rows') ?? '[]');
}

async function waitForTableLoaded(expectedTotal: number) {
  await waitFor(() => {
    const table = document.querySelector('sky-data-table');
    expect(table?.getAttribute('total')).toBe(String(expectedTotal));
  }, LONG);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('VendorCustomers — "View" action navigates (not the native drawer)', () => {
  it('fires a real view-customer action (never __view_detail__) with the row\'s customer id attached', async () => {
    listMyCustomersMock.mockResolvedValue({ data: [customerRow()], meta: { total: 1 } });
    render(<VendorCustomers />);
    await waitForTableLoaded(1);

    const actions = JSON.parse(document.querySelector('sky-data-table')?.getAttribute('actions') ?? '[]');
    expect(actions).toEqual([{ icon: 'visibility', label: 'View', event: 'view-customer' }]);
    expect(JSON.stringify(actions)).not.toContain('__view_detail__');
  });

  it('clicking View navigates to /account/vendor-customers/:customerId for that row', async () => {
    listMyCustomersMock.mockResolvedValue({ data: [customerRow({ id: 'cust-42' })], meta: { total: 1 } });
    render(<VendorCustomers />);
    await waitForTableLoaded(1);

    const table = document.querySelector('sky-data-table') as Element;
    fireEvent(
      table,
      new CustomEvent('sky-dt-row-action', { detail: { action: 'view-customer', row: tableRows()[0] } }),
    );

    expect(navigateMock).toHaveBeenCalledWith('/account/vendor-customers/cust-42');
  });

  it('ignores an unrelated row action (no navigation)', async () => {
    listMyCustomersMock.mockResolvedValue({ data: [customerRow()], meta: { total: 1 } });
    render(<VendorCustomers />);
    await waitForTableLoaded(1);

    const table = document.querySelector('sky-data-table') as Element;
    fireEvent(table, new CustomEvent('sky-dt-row-action', { detail: { action: 'some-other-action', row: tableRows()[0] } }));

    expect(navigateMock).not.toHaveBeenCalled();
  });
});

describe('VendorCustomers — list rendering', () => {
  it('renders an empty customer list as zero rows, not an error', async () => {
    listMyCustomersMock.mockResolvedValue({ data: [], meta: { total: 0 } });
    render(<VendorCustomers />);
    await waitForTableLoaded(0);
    expect(tableRows()).toEqual([]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an error state when the list fails to load', async () => {
    listMyCustomersMock.mockRejectedValue(new Error('network down'));
    render(<VendorCustomers />);
    expect(await screen.findByRole('alert', {}, LONG)).toBeTruthy();
  });

  it('maps name/phone/email fallbacks ("—") when blank', async () => {
    listMyCustomersMock.mockResolvedValue({ data: [customerRow({ name: '', phone: null, email: null })], meta: { total: 1 } });
    render(<VendorCustomers />);
    await waitForTableLoaded(1);
    const [row] = tableRows();
    expect(row.Name).toBe('—');
    expect(row.Phone).toBe('—');
    expect(row.Email).toBe('—');
  });
});
