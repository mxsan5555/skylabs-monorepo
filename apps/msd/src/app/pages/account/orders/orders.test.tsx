import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Order } from '../../../../api/rbac/orders';
import { OrderManagement } from './orders';

let grantedPermissions: Set<string>;

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({
    token: 'test-token',
    can: (menuKey: string, action = 'view') => grantedPermissions.has(`${menuKey}:${action}`),
  }),
}));

const listOrdersMock = vi.fn();
const getOrderMock = vi.fn();
const setOrderStatusMock = vi.fn();

vi.mock('../../../../api/rbac/orders', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/orders')>('../../../../api/rbac/orders');
  return {
    ...actual,
    listOrders: (...args: unknown[]) => listOrdersMock(...args),
    getOrder: (...args: unknown[]) => getOrderMock(...args),
    setOrderStatus: (...args: unknown[]) => setOrderStatusMock(...args),
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
    },
  ],
  customer: { id: 'cust-1', name: 'Asha Rao', phone: '9999999999', email: 'asha@example.com' },
  vendor: { id: 'vendor-1', businessName: 'Zen Spa' },
  branch: { id: 'branch-1', name: 'Zen Spa — MG Road', address: '12 MG Road', city: 'Bengaluru' },
  payments: [
    { id: 'pay-1', status: 'PAID', provider: 'razorpay', amount: '1000.00', currency: 'INR', failureReason: null, createdAt: '2026-01-01T00:05:00.000Z' },
  ],
};

function renderPage(url = '/account/orders') {
  return render(
    <MemoryRouter initialEntries={[url]}>
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
});

/**
 * Feature: Admin Orders list — null-safe row mapping
 * Scenario: `toOrderRow` (internal to orders.tsx) must never throw when an order's optional
 * relations are null — specifically `order.branch`, which is legitimately null for a Product-only
 * order (Product is vendor-level, not branch-level — see Order.branchId's schema doc comment in
 * msd-api). Regression coverage for the ErrorBoundary crash at orders.tsx:89
 * ("Cannot read properties of null (reading 'address')").
 *
 * Given: `listOrders` returns orders whose optional fields vary
 * When: the Orders page renders
 * Then: the page never crashes, and "Branch Address" falls back to "—" wherever branch/address
 * data is missing
 */
describe('OrderManagement — null-safe order row mapping', () => {
  it('renders an order with a full branch + address without crashing', async () => {
    listOrdersMock.mockResolvedValue({ data: [BASE_ORDER], meta: { total: 1 } });
    renderPage();
    await waitForTableLoaded(1);
    const [row] = tableRows();
    expect(row['Branch Address']).toBe('12 MG Road, Bengaluru');
    expect(row.Customer).toBe('Asha Rao');
  });

  it('falls back to "—" when branch exists but address/city are both null', async () => {
    const order: Order = { ...BASE_ORDER, id: 'order-2', branch: { id: 'branch-1', name: 'Zen Spa — MG Road', address: null, city: null } };
    listOrdersMock.mockResolvedValue({ data: [order], meta: { total: 1 } });
    renderPage();
    await waitForTableLoaded(1);
    const [row] = tableRows();
    expect(row['Branch Address']).toBe('—');
  });

  it('does NOT crash and falls back to "—" when order.branch itself is null (Product-only order)', async () => {
    const order: Order = {
      ...BASE_ORDER,
      id: 'order-3',
      type: 'PRODUCT',
      branchId: null as unknown as string,
      branchNameSnapshot: null,
      branch: null,
      items: [
        {
          id: 'item-2',
          dealId: null,
          dealPackageId: null,
          therapistId: null,
          therapistPackageId: null,
          vendorId: 'vendor-1',
          branchId: null,
          vendorNameSnapshot: 'Zen Spa',
          branchNameSnapshot: null,
          itemName: 'Aroma Candle',
          itemType: 'PRODUCT',
          unitPrice: '250.00',
          quantity: 2,
          lineTotal: '500.00',
          durationMinutes: null,
        },
      ],
    };
    listOrdersMock.mockResolvedValue({ data: [order], meta: { total: 1 } });
    renderPage();
    await waitForTableLoaded(1);
    const [row] = tableRows();
    expect(row['Branch Address']).toBe('—');
    expect(row.Branch).toBe('—');
    expect(row.Item).toBe('Aroma Candle');
    expect(row.Quantity).toBe(2);
  });

  it('renders customer phone/email fallbacks as "—" when null, without touching a null customer object', async () => {
    const order: Order = { ...BASE_ORDER, id: 'order-4', customer: { id: 'cust-1', name: 'Asha Rao', phone: null, email: null } };
    listOrdersMock.mockResolvedValue({ data: [order], meta: { total: 1 } });
    renderPage();
    await waitForTableLoaded(1);
    const [row] = tableRows();
    expect(row['Customer Phone']).toBe('—');
    expect(row['Customer Email']).toBe('—');
  });

  it('renders an order with no payments (Payment/Provider/Failure columns fall back to "—")', async () => {
    const order: Order = { ...BASE_ORDER, id: 'order-5', payments: [] };
    listOrdersMock.mockResolvedValue({ data: [order], meta: { total: 1 } });
    renderPage();
    await waitForTableLoaded(1);
    const [row] = tableRows();
    expect(row['Payment Status']).toBe('—');
    expect(row['Payment Provider']).toBe('—');
  });

  it('renders an empty orders response as zero rows, not an error', async () => {
    listOrdersMock.mockResolvedValue({ data: [], meta: { total: 0 } });
    renderPage();
    await waitForTableLoaded(0);
    expect(tableRows()).toEqual([]);
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

/**
 * P10-49: the member page links "N orders" to `/account/orders?vendorId=<member>`. The list sends
 * that filter to the API and says it is filtered, with a way back to every order.
 */
describe('OrderManagement — member filter from the address', () => {
  it('sends vendorId to the API and shows the filter with a clear button', async () => {
    listOrdersMock.mockResolvedValue({ data: [BASE_ORDER], meta: { total: 1 } });
    renderPage('/account/orders?vendorId=vendor-1');
    await waitForTableLoaded(1);
    expect(listOrdersMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ vendorId: 'vendor-1' }));
    expect(screen.getByText("Showing one member's orders.")).toBeTruthy();

    fireEvent.click(screen.getByRole('link', { name: 'Show all orders' }));
    await waitFor(() => expect(listOrdersMock).toHaveBeenLastCalledWith(expect.anything(), expect.not.objectContaining({ vendorId: 'vendor-1' })));
    expect(screen.queryByText("Showing one member's orders.")).toBeNull();
  });

  it('sends no vendorId and shows no filter note without the parameter', async () => {
    listOrdersMock.mockResolvedValue({ data: [BASE_ORDER], meta: { total: 1 } });
    renderPage();
    await waitForTableLoaded(1);
    expect(listOrdersMock).toHaveBeenCalledWith(expect.anything(), expect.not.objectContaining({ vendorId: expect.anything() }));
    expect(screen.queryByText("Showing one member's orders.")).toBeNull();
  });
});
