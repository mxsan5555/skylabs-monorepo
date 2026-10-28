import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CustomerRow } from '../../../../api/rbac/vendors';
import { VendorCustomers } from './vendor-customers';

// vi.mock calls are hoisted above the imports.
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => ({ token: 'tok' }) }));

const listMyCustomersMock = vi.fn();
vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return { ...actual, listMyCustomers: (...args: unknown[]) => listMyCustomersMock(...args) };
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
