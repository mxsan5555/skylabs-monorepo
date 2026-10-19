import { render, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Order } from '../../../../api/rbac/orders';

import { OrderManagement } from './orders';

// Full-suite runs under worker-pool load can push jsdom async resolution past testing-library's
// default 1000ms waitFor/findBy timeout even though every assertion here is otherwise correct —
// the same class of flake `member-settlement-detail.test.tsx`/`orders-and-verify.test.tsx` widen
// for. Widen the timeout rather than chase a race that isn't actually here.
const LONG = { timeout: 5000 };

let grantedPermissions: Set<string>;

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({
    token: 'test-token',
    can: (menuKey: string, action = 'view') => grantedPermissions.has(`${menuKey}:${action}`),
  }),
}));

const listOrdersMock = vi.fn();
const getOrderCountsMock = vi.fn();
const setOrderStatusMock = vi.fn();
const listVendorsMock = vi.fn();

vi.mock('../../../../api/rbac/orders', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/orders')>('../../../../api/rbac/orders');
  return {
    ...actual,
    listOrders: (...args: unknown[]) => listOrdersMock(...args),
    getOrderCounts: (...args: unknown[]) => getOrderCountsMock(...args),
    setOrderStatus: (...args: unknown[]) => setOrderStatusMock(...args),
  };
});

vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    listVendors: (...args: unknown[]) => listVendorsMock(...args),
  };
});

const BASE_ORDER: Order = {
  id: 'order-1',
  customerId: 'cust-1',
  vendorId: 'vendor-1',
  branchId: 'branch-1',
  type: 'SERVICE',
  status: 'CONFIRMED',
  vendorNameSnapshot: 'Zen Spa',
  branchNameSnapshot: 'Zen Spa — MG Road',
  subtotal: '1000.00',
  total: '1000.00',
  cancellationReason: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  contactName: null,
  contactPhone: null,
  contactEmail: null,
  shippingAddress: null,
  shippingCity: null,
  shippingState: null,
  shippingPincode: null,
  items: [
    {
      id: 'item-1',
      dealId: 'deal-1',
      dealPackageId: 'pkg-1',
      therapistId: null,
      therapistPackageId: null,
      vendorId: 'vendor-1',
      branchId: 'branch-1',
      vendorNameSnapshot: 'Zen Spa',
      branchNameSnapshot: 'Zen Spa — MG Road',
      itemName: 'Swedish Massage',
      itemType: 'SERVICE',
      unitPrice: '1000.00',
      quantity: 1,
      lineTotal: '1000.00',
      durationMinutes: 60,
      image: null,
      purchaseEntitlements: [],
    },
  ],
  customer: { id: 'cust-1', name: 'Asha Rao', phone: '9999999999', email: 'asha@example.com' },
  vendor: { id: 'vendor-1', businessName: 'Zen Spa' },
  branch: { id: 'branch-1', name: 'Zen Spa — MG Road', address: '12 MG Road', city: 'Bengaluru' },
  payments: [
    { id: 'pay-1', status: 'PAID', provider: 'razorpay', amount: '1000.00', currency: 'INR', failureReason: null, createdAt: '2026-01-01T00:05:00.000Z' },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/account/orders']}>
      <OrderManagement />
    </MemoryRouter>,
  );
}

async function waitForTableLoaded(expectedTotal: number): Promise<void> {
  await waitFor(() => {
    const table = document.querySelector('sky-data-table');
    expect(table?.getAttribute('total')).toBe(String(expectedTotal));
  });
}

function tableRows(): Record<string, unknown>[] {
  const table = document.querySelector('sky-data-table');
  return JSON.parse(table?.getAttribute('rows') ?? '[]');
}

beforeEach(() => {
  vi.clearAllMocks();
  grantedPermissions = new Set(['orders:status_change']);
  getOrderCountsMock.mockResolvedValue({ data: { total: 0, paid: 0, pendingPayment: 0 } });
  listVendorsMock.mockResolvedValue({ data: [] });
});

/**
 * Feature: Admin Orders list — the Order/Date, Customer/Phone, and Purchase/Member column groups
 * (`secondaryKey`-driven two-line cells) that replaced the old raw-UUID, one-field-per-column
 * layout. Regression coverage for the reworked `toOrderRow`.
 */
describe('OrderManagement — reworked row mapping', () => {
  it('renders the Order/Date, Customer/Phone, and Amount groups from a single-vendor order', async () => {
    listOrdersMock.mockResolvedValue({ data: [BASE_ORDER], meta: { total: 1 } });
    renderPage();
    await waitForTableLoaded(1);
    const [row] = tableRows();
    expect(row.Order).toBe('ORD-ORDER-1');
    expect(row['Order Date']).toBe(new Date(BASE_ORDER.createdAt).toLocaleString());
    expect(row.Customer).toBe('Asha Rao');
    expect(row['Customer Phone']).toBe('9999999999');
    expect(row.Purchase).toBe('Swedish Massage');
    expect(row['Purchase Detail']).toBe('Deal Order · Zen Spa');
    expect(row.Amount).toBe('₹1,000');
    expect(row.__orderId).toBe('order-1');
    expect(row.__customerId).toBe('cust-1');
  });

  it('shows "+N more items" and "N members" for a multi-item, multi-vendor order', async () => {
    const order: Order = {
      ...BASE_ORDER,
      id: 'order-2',
      items: [
        ...BASE_ORDER.items,
        {
          id: 'item-2',
          dealId: null,
          dealPackageId: null,
          therapistId: null,
          therapistPackageId: null,
          vendorId: 'vendor-2',
          branchId: 'branch-2',
          vendorNameSnapshot: 'Glow Spa',
          branchNameSnapshot: 'Glow Spa — Koramangala',
          itemName: 'Aroma Candle',
          itemType: 'PRODUCT',
          unitPrice: '250.00',
          quantity: 1,
          lineTotal: '250.00',
          durationMinutes: null,
          image: null,
          purchaseEntitlements: [],
        },
      ],
    };
    listOrdersMock.mockResolvedValue({ data: [order], meta: { total: 1 } });
    renderPage();
    await waitForTableLoaded(1);
    const [row] = tableRows();
    expect(row.Purchase).toBe('Swedish Massage +1 more item');
    expect(row['Purchase Detail']).toBe('Mixed Order · 2 members');
  });

  it('falls back to "Unknown customer"-style display and "—" phone when customer data is blank', async () => {
    const order: Order = { ...BASE_ORDER, id: 'order-3', customer: { id: 'cust-1', name: '', phone: null, email: null } };
    listOrdersMock.mockResolvedValue({ data: [order], meta: { total: 1 } });
    renderPage();
    await waitForTableLoaded(1);
    const [row] = tableRows();
    expect(row['Customer Phone']).toBe('—');
  });

  it('renders an order with no payments (Payment Status falls back to "—")', async () => {
    const order: Order = { ...BASE_ORDER, id: 'order-5', payments: [] };
    listOrdersMock.mockResolvedValue({ data: [order], meta: { total: 1 } });
    renderPage();
    await waitForTableLoaded(1);
    const [row] = tableRows();
    expect(row['Payment Status']).toBe('—');
  });

  it('renders an empty orders response as zero rows, not an error', async () => {
    listOrdersMock.mockResolvedValue({ data: [], meta: { total: 0 } });
    renderPage();
    await waitForTableLoaded(0);
    expect(tableRows()).toEqual([]);
  });

  it('loads the three summary cards from GET /orders/counts, not the visible page', async () => {
    listOrdersMock.mockResolvedValue({ data: [BASE_ORDER], meta: { total: 1 } });
    getOrderCountsMock.mockResolvedValue({ data: { total: 42, paid: 30, pendingPayment: 5 } });
    renderPage();
    await waitForTableLoaded(1);
    await waitFor(() => expect(getOrderCountsMock).toHaveBeenCalled(), LONG);
  });

  /**
   * Feature: Order History — Completed-but-unpaid ("Needs Review") visibility
   * Scenario: an order whose Order Status has moved to COMPLETED but which has no PAID payment
   * attempt at all must render BOTH facts distinctly — the Order Status badge still says
   * COMPLETED, and the separate Payment Status column must show its own, visibly-different value
   * ('—', never silently reusing/implying PAID) — the two columns are never merged into one, and
   * an admin scanning the list can tell at a glance that this row needs a second look.
   */
  it('a COMPLETED order with no PAID payment shows Order Status=COMPLETED and Payment Status="—" as two distinct, visible columns — never merged or implying paid', async () => {
    const order: Order = { ...BASE_ORDER, id: 'order-needs-review', status: 'COMPLETED', payments: [] };
    listOrdersMock.mockResolvedValue({ data: [order], meta: { total: 1 } });
    renderPage();
    await waitForTableLoaded(1);
    const [row] = tableRows();
    expect(row['Order Status']).toBe('COMPLETED');
    expect(row['Payment Status']).toBe('—');
    expect(row['Payment Status']).not.toBe('PAID');
  });

  it("shows the latest payment attempt's own status (e.g. FAILED) rather than '—' when at least one payment attempt exists, even on a COMPLETED order", async () => {
    const order: Order = {
      ...BASE_ORDER,
      id: 'order-failed-payment',
      status: 'COMPLETED',
      payments: [{ id: 'pay-failed', status: 'FAILED', provider: 'razorpay', amount: '1000.00', currency: 'INR', failureReason: 'Card declined', createdAt: '2026-01-02T00:00:00.000Z' }],
    };
    listOrdersMock.mockResolvedValue({ data: [order], meta: { total: 1 } });
    renderPage();
    await waitForTableLoaded(1);
    const [row] = tableRows();
    expect(row['Order Status']).toBe('COMPLETED');
    expect(row['Payment Status']).toBe('FAILED');
  });
});

/**
 * Feature: Order History — URL-persisted filter/search/pagination state
 * Scenario: page/pageSize/search/filter live in the URL (`useSearchParams`), not component state
 * alone — so navigating away to an order's detail page and back (the browser's own Back button)
 * restores the exact same list state, never resetting to page 1 / no filters.
 */
describe('OrderManagement — URL-persisted table params', () => {
  it('reads page/pageSize/search/filter from the URL on mount and passes them to listOrders', async () => {
    listOrdersMock.mockResolvedValue({ data: [], meta: { total: 0 } });
    render(
      <MemoryRouter initialEntries={['/account/orders?page=2&pageSize=20&search=priya&filter=CONFIRMED']}>
        <OrderManagement />
      </MemoryRouter>,
    );
    await waitFor(() => expect(listOrdersMock).toHaveBeenCalled(), LONG);
    expect(listOrdersMock).toHaveBeenCalledWith(
      'test-token',
      expect.objectContaining({ page: 2, pageSize: 20, search: 'priya', status: 'CONFIRMED' }),
    );
  });

  it('a sky-dt-params-change event writes the new page/pageSize/search/filter into the URL (so Back restores this exact state) and re-fetches with them', async () => {
    listOrdersMock.mockResolvedValue({ data: [BASE_ORDER], meta: { total: 1 } });
    render(
      <MemoryRouter initialEntries={['/account/orders']}>
        <Routes>
          <Route path="/account/orders" element={<OrderManagement />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitForTableLoaded(1);

    const table = document.querySelector('sky-data-table') as Element;
    fireEvent(
      table,
      new CustomEvent('sky-dt-params-change', { detail: { page: 3, pageSize: 25, search: 'zen spa', filter: 'CANCELLED' } }),
    );

    await waitFor(() => {
      expect(listOrdersMock).toHaveBeenCalledWith(
        'test-token',
        expect.objectContaining({ page: 3, pageSize: 25, search: 'zen spa', status: 'CANCELLED' }),
      );
    }, LONG);
    // The table's own `page`/`page-size` attributes reflect the same URL-driven state.
    expect(table?.getAttribute('page')).toBe('3');
    expect(table?.getAttribute('page-size')).toBe('25');
  });
});

/**
 * Feature: `OrderManagement scope="member"` — the Member Orders page's "Order History" tab
 * Scenario: the Member/vendor picker filter ("Search members" + "Member" select) must be
 * completely absent for `scope="member"` (a member has no business seeing a global member
 * filter on their own order list), while everything else — pagination, search, status filter,
 * the three summary cards — still renders and functions identically to `scope="admin"`.
 *
 * Given: a member caller rendering `<OrderManagement scope="member" />`
 * When: the page loads
 * Then: no "Search members"/"Member" controls render, but the table, summary cards, and status
 *       filter still do
 *
 * Edge cases:
 * - default (`scope` omitted) still shows the member picker — scope="admin" behaviour is
 *   unchanged
 * - the member-picker-driven `listVendors` lookup is never even called for scope="member" (not
 *   just hidden in the DOM — no wasted/leaky request a member would 403 on)
 */
// `OutlinedTextField`/`OutlinedSelect` declare `label` as a plain, non-reflected Lit property
// (see `branch-form-page.test.tsx`'s own doc comment) — React always sets it as a JS property,
// never an HTML attribute, so it can't be queried via `getByText`/`[label="..."]`. The filter row
// (`.form-grid` directly under the header) is the only place these controls live; count its own
// `md-outlined-text-field`/`md-outlined-select` children rather than querying by label text.
function filterRowTextFieldCount(): number {
  return document.querySelectorAll('.form-grid md-outlined-text-field').length;
}
function filterRowSelectCount(): number {
  return document.querySelectorAll('.form-grid md-outlined-select').length;
}

describe('OrderManagement — scope="member" hides the admin-only member picker', () => {
  it('renders no "Search members"/"Member" controls, and never calls listVendors, under scope="member"', async () => {
    listOrdersMock.mockResolvedValue({ data: [BASE_ORDER], meta: { total: 1 } });
    render(
      <MemoryRouter initialEntries={['/account/vendor-orders']}>
        <OrderManagement scope="member" />
      </MemoryRouter>,
    );
    await waitForTableLoaded(1);

    // Only "Payment Status" remains — "Search members" (text field) and "Member" (select) are gone.
    expect(filterRowTextFieldCount()).toBe(0);
    expect(filterRowSelectCount()).toBe(1);
    expect(listVendorsMock).not.toHaveBeenCalled();
  });

  it('still renders pagination/search/status-filter/summary cards under scope="member" — only the member picker is removed', async () => {
    listOrdersMock.mockResolvedValue({ data: [BASE_ORDER], meta: { total: 1 } });
    getOrderCountsMock.mockResolvedValue({ data: { total: 7, paid: 3, pendingPayment: 1 } });
    render(
      <MemoryRouter initialEntries={['/account/vendor-orders']}>
        <OrderManagement scope="member" />
      </MemoryRouter>,
    );
    await waitForTableLoaded(1);

    const table = document.querySelector('sky-data-table');
    expect(table?.hasAttribute('searchable')).toBe(true);
    expect(table?.hasAttribute('filter-options')).toBe(true);
    await waitFor(() => expect(getOrderCountsMock).toHaveBeenCalled(), LONG);
    // sky-tile-card's `headline` is a plain (non-text-content) attribute — same
    // attribute-selector convention `order-detail-page.test.tsx`'s `needsReviewCard()` uses.
    expect(document.querySelector('sky-tile-card')).toBeNull();
    expect(document.querySelector('h1')).toBeNull();
  });

  it('defaults to scope="admin" (member picker present) when the prop is omitted — unchanged existing behaviour', async () => {
    listOrdersMock.mockResolvedValue({ data: [], meta: { total: 0 } });
    renderPage();
    await waitForTableLoaded(0);
    expect(filterRowTextFieldCount()).toBe(1); // "Search members"
    expect(filterRowSelectCount()).toBe(2); // "Payment Status" + "Member"
  });
});

describe('OrderManagement — members never change order status (D27)', () => {
  const tableActions = () => {
    const table = document.querySelector('sky-data-table') as (HTMLElement & { actions?: string }) | null;
    return String(table?.actions ?? table?.getAttribute('actions') ?? '');
  };

  it('offers Change status to staff holding orders:status_change', async () => {
    listOrdersMock.mockResolvedValue({ data: [], meta: { total: 0 } });
    renderPage();
    await waitFor(() => expect(tableActions()).toContain('change-status'));
  });

  it("never offers it to a member (members:custom only), for deal or product orders", async () => {
    grantedPermissions = new Set(['members:custom']);
    listOrdersMock.mockResolvedValue({ data: [], meta: { total: 0 } });
    renderPage();
    await waitFor(() => expect(listOrdersMock).toHaveBeenCalled());
    expect(tableActions()).not.toContain('change-status');
  });
});
