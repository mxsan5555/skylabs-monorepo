import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CustomerRow } from '../../../../api/rbac/vendors';
import { VendorCustomers } from './vendor-customers';

// vi.mock calls are hoisted above the imports.
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => ({ token: 'tok' }) }));

const listMyCustomersMock = vi.fn();
const listVendorCustomersForAdminMock = vi.fn();
vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    listMyCustomers: (...args: unknown[]) => listMyCustomersMock(...args),
    listVendorCustomersForAdmin: (...args: unknown[]) => listVendorCustomersForAdminMock(...args),
  };
});

/**
 * Feature: the member's own Customers screen (D19, P4-16): name, city, order count, last order
 * date; phone and email only while the customer has an open order, otherwise a hidden note.
 */
const OPEN: CustomerRow = {
  id: 'c1',
  name: 'Asha',
  city: 'Pune',
  orderCount: 2,
  lastActivityAt: '2026-10-05T00:00:00.000Z',
  hasOpenOrder: true,
  phone: '+919800000001',
  email: 'asha@example.com',
};
const CLOSED: CustomerRow = { ...OPEN, id: 'c2', name: 'Ravi', city: null, hasOpenOrder: false, phone: null, email: null };

const tableRows = () => JSON.parse(document.querySelector('sky-data-table')?.getAttribute('rows') ?? '[]') as Record<string, unknown>[];

beforeEach(() => {
  vi.clearAllMocks();
  listMyCustomersMock.mockResolvedValue({ data: [OPEN, CLOSED], meta: { total: 2 } });
});

describe('VendorCustomers', () => {
  it('shows City and the contact details of a customer with an open order', async () => {
    render(<VendorCustomers />);
    await waitFor(() => expect(tableRows()).toHaveLength(2));
    const columns = JSON.parse(document.querySelector('sky-data-table')?.getAttribute('columns') ?? '[]') as { label: string }[];
    expect(columns.map((c) => c.label)).toContain('City');
    expect(tableRows()[0]).toMatchObject({ Name: 'Asha', City: 'Pune', Phone: '+919800000001', Email: 'asha@example.com', Orders: 2 });
  });

  it('says contact details are hidden until an order is open, and shows a dash for a missing city', async () => {
    render(<VendorCustomers />);
    await waitFor(() => expect(tableRows()).toHaveLength(2));
    expect(tableRows()[1]).toMatchObject({
      Name: 'Ravi',
      City: '—',
      Phone: 'Hidden until an order is open',
      Email: 'Hidden until an order is open',
    });
  });
});

/** P10-49: staff open the same table as the member page's Customers tab, through the staff route,
 *  with contact details (D12) and without the page header of the member's own screen. */
describe('VendorCustomers for staff (vendorId given)', () => {
  it('uses the staff route, shows contact details even without an open order, and renders no page heading', async () => {
    listVendorCustomersForAdminMock.mockResolvedValue({
      data: [{ ...CLOSED, phone: '+919800000002', email: 'ravi@example.com' }],
      meta: { total: 1 },
    });
    render(<VendorCustomers vendorId="m1" />);
    await waitFor(() => expect(tableRows()).toHaveLength(1));
    expect(listVendorCustomersForAdminMock).toHaveBeenCalledWith('tok', 'm1', { page: 1, pageSize: 20 });
    expect(listMyCustomersMock).not.toHaveBeenCalled();
    expect(tableRows()[0]).toMatchObject({ Phone: '+919800000002', Email: 'ravi@example.com' });
    expect(document.querySelector('h1')).toBeNull();
  });
});
