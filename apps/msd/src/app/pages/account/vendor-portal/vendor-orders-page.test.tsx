import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VendorOrdersPage } from './vendor-orders-page';

/**
 * Feature: vendor "Orders" page (no tabs) — the scan entry point, the vendor's own open
 * services/products, and the existing order history list.
 * Scenario: "Scan customer QR" navigates to the scanner; "Services waiting"/"Products to give or
 * send" render from `GET /vouchers/pending-fulfilment`; a product's "Picked up"/"Ship instead"
 * actions call the right endpoint and reload the lists; legacy `?tab=scan` redirects to the
 * scanner (never lands on a tab that no longer exists).
 */

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => ({ token: 'tok' }) }));

const listPendingFulfilmentMock = vi.fn();
const markProductPickedUpMock = vi.fn();
const shipVoucherMock = vi.fn();
vi.mock('../../../../api/rbac/vouchers', () => ({
  listPendingFulfilment: (...args: unknown[]) => listPendingFulfilmentMock(...args),
  markProductPickedUp: (...args: unknown[]) => markProductPickedUpMock(...args),
  shipVoucher: (...args: unknown[]) => shipVoucherMock(...args),
}));

// `OrderManagement` is already fully tested in `orders.test.tsx` — stub it here so this file only
// exercises `VendorOrdersPage`'s own logic (scan CTA, pending lists, legacy redirects).
const orderManagementPropsSeen: Record<string, unknown>[] = [];
vi.mock('../orders/orders', () => ({
  OrderManagement: (props: Record<string, unknown>) => {
    orderManagementPropsSeen.push(props);
    return <p>order-history-stub</p>;
  },
}));

function emptyPending() {
  return { data: { servicesWaiting: [], productsPending: [] } };
}

function renderAt(url = '/account/vendor-orders') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/account/vendor-orders" element={<VendorOrdersPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  orderManagementPropsSeen.length = 0;
  listPendingFulfilmentMock.mockResolvedValue(emptyPending());
});

describe('VendorOrdersPage — layout', () => {
  it('renders no tabs — Services waiting, Products pending, and All orders all render on one page', async () => {
    renderAt();
    await screen.findByText('order-history-stub');
    expect(screen.getByText('Services waiting (0)')).toBeTruthy();
    expect(screen.getByText('Products to give or send (0)')).toBeTruthy();
    expect(orderManagementPropsSeen[0]).toMatchObject({ scope: 'member' });
  });

  it('"Scan customer QR" navigates to the scanner', async () => {
    renderAt();
    await screen.findByText('order-history-stub');
    const scanButton = Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Scan customer QR'));
    fireEvent.click(scanButton as HTMLElement);
    expect(navigateMock).toHaveBeenCalledWith('/account/vendor-orders/scan');
  });
});

describe('VendorOrdersPage — Services waiting', () => {
  it('renders each service with its type tag, phone, and valid-till date', async () => {
    listPendingFulfilmentMock.mockResolvedValue({
      data: {
        servicesWaiting: [
          { id: 's1', voucherCode: 'MSD-DL-1', itemName: 'Deep Tissue Massage', kind: 'DEAL', customerPhone: '+919999999999', validTill: '2026-12-21T10:00:00.000Z', orderId: 'order-1' },
        ],
        productsPending: [],
      },
    });
    renderAt();
    expect(await screen.findByText('Deep Tissue Massage')).toBeTruthy();
    expect(screen.getByText('+919999999999 · Valid till 21 December 2026')).toBeTruthy();
    expect(screen.getByText('Waiting for scan')).toBeTruthy();
  });
});

describe('VendorOrdersPage — Products to give or send', () => {
  it('a PRODUCT_PICKUP row offers Picked up and Ship instead', async () => {
    listPendingFulfilmentMock.mockResolvedValue({
      data: { servicesWaiting: [], productsPending: [{ id: 'p1', voucherCode: 'MSD-PR-1', itemName: 'Serum', fulfilmentKind: 'PRODUCT_PICKUP', customerPhone: '+911111', orderId: 'order-2' }] },
    });
    renderAt();
    await screen.findByText('Serum');
    expect(Array.from(document.querySelectorAll('md-filled-button')).some((el) => el.textContent?.includes('Picked up'))).toBe(true);
    expect(Array.from(document.querySelectorAll('md-outlined-button')).some((el) => el.textContent?.includes('Ship instead'))).toBe(true);
  });

  it('tapping Picked up calls markProductPickedUp and reloads the list', async () => {
    listPendingFulfilmentMock.mockResolvedValue({
      data: { servicesWaiting: [], productsPending: [{ id: 'p1', voucherCode: 'MSD-PR-1', itemName: 'Serum', fulfilmentKind: 'PRODUCT_PICKUP', customerPhone: '+911111', orderId: 'order-2' }] },
    });
    markProductPickedUpMock.mockResolvedValue({ data: {} });
    renderAt();
    await screen.findByText('Serum');

    const pickedUpButton = Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Picked up'));
    fireEvent.click(pickedUpButton as HTMLElement);

    await waitFor(() => expect(markProductPickedUpMock).toHaveBeenCalledWith('tok', 'MSD-PR-1'));
    await waitFor(() => expect(listPendingFulfilmentMock).toHaveBeenCalledTimes(2));
  });

  it('a PRODUCT_SHIPPED row shows a Shipped badge with no action buttons', async () => {
    listPendingFulfilmentMock.mockResolvedValue({
      data: { servicesWaiting: [], productsPending: [{ id: 'p2', voucherCode: 'MSD-PR-2', itemName: 'Oil', fulfilmentKind: 'PRODUCT_SHIPPED', customerPhone: '+922222', orderId: 'order-3' }] },
    });
    renderAt();
    await screen.findByText('Oil');
    expect(screen.getByText('Shipped')).toBeTruthy();
    expect(document.querySelectorAll('md-filled-button')).toHaveLength(1); // only the "Scan customer QR" button
  });
});

describe('VendorOrdersPage — legacy deep links', () => {
  it('?tab=scan redirects straight to the scanner', async () => {
    renderAt('/account/vendor-orders?tab=scan');
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/account/vendor-orders/scan', { replace: true }));
  });

  it('?tab=verify never triggers a scan redirect — lands on this page\'s own Services waiting list', async () => {
    renderAt('/account/vendor-orders?tab=verify');
    await screen.findByText('order-history-stub');
    expect(navigateMock).not.toHaveBeenCalledWith('/account/vendor-orders/scan');
    expect(screen.getByText('Services waiting (0)')).toBeTruthy();
  });
});
