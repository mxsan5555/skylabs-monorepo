import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VendorOrderDetailPage } from './vendor-order-detail-page';

/**
 * Feature: vendor-only Order Detail (`/account/vendor-orders/:orderId`)
 * Scenario: order id/date, customer phone, paid amount, then one row per item with its own
 * status/action — a pending `PRODUCT_PICKUP` gets "Picked up"/"Ship instead"; a shipped product
 * gets "Record delivery evidence"; a service line is a static Waiting for scan/In service/
 * Completed badge (never an action — only a scan can advance it from here).
 */

const LONG = { timeout: 5000 };

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

let grantedPermissions: Set<string>;
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({
    token: 'tok',
    can: (menuKey: string, action = 'view') => grantedPermissions.has(`${menuKey}:${action}`),
  }),
}));

const getOrderMock = vi.fn();
vi.mock('../../../../api/rbac/orders', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/orders')>('../../../../api/rbac/orders');
  return { ...actual, getOrder: (...args: unknown[]) => getOrderMock(...args) };
});

const markProductPickedUpMock = vi.fn();
const shipVoucherMock = vi.fn();
const recordDeliveryEvidenceMock = vi.fn();
vi.mock('../../../../api/rbac/vouchers', () => ({
  markProductPickedUp: (...args: unknown[]) => markProductPickedUpMock(...args),
  shipVoucher: (...args: unknown[]) => shipVoucherMock(...args),
  recordDeliveryEvidence: (...args: unknown[]) => recordDeliveryEvidenceMock(...args),
}));

const ORDER_ID = 'order-1';

function baseOrder(items: Record<string, unknown>[]): Record<string, unknown> {
  return {
    id: ORDER_ID,
    createdAt: '2026-11-01T10:00:00.000Z',
    customer: { id: 'cust-1', name: 'Jane Doe', phone: '+919876543210', email: null },
    payments: [{ id: 'pay-1', status: 'PAID', provider: 'razorpay', amount: '1000.00', currency: 'INR', failureReason: null, createdAt: '2026-11-01T10:05:00.000Z' }],
    items,
  };
}

function item(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'item-1',
    itemName: 'Serum',
    quantity: 1,
    purchaseEntitlements: [
      { id: 'ent-1', voucherCode: 'MSD-PR-1', fulfilmentKind: 'PRODUCT_PICKUP', entitlementStatus: 'ACTIVE', settlementStatus: 'PENDING_FULFILMENT', carrier: null, trackingNumber: null, shippedAt: null, deliveryEvidenceStorageKey: null, deliveryEvidenceNote: null },
    ],
    ...overrides,
  };
}

function renderAt() {
  return render(
    <MemoryRouter initialEntries={[`/account/vendor-orders/${ORDER_ID}`]}>
      <Routes>
        <Route path="/account/vendor-orders/:orderId" element={<VendorOrderDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  grantedPermissions = new Set(['vendor-portal.orders:custom']);
});

describe('VendorOrderDetailPage — header', () => {
  it('shows the order id, date, customer phone, and paid amount', async () => {
    getOrderMock.mockResolvedValue({ data: baseOrder([item()]) });
    renderAt();

    await screen.findByText(/Order ORD-/, {}, LONG);
    expect(screen.getByText(/\+919876543210/)).toBeTruthy();
    expect(screen.getByText('₹1,000')).toBeTruthy();
  });
});

describe('VendorOrderDetailPage — product pickup row', () => {
  it('offers Picked up and Ship instead for a pending PRODUCT_PICKUP line', async () => {
    getOrderMock.mockResolvedValue({ data: baseOrder([item()]) });
    renderAt();
    await screen.findByText('Serum', {}, LONG);

    expect(Array.from(document.querySelectorAll('md-filled-button')).some((el) => el.textContent?.includes('Picked up'))).toBe(true);
    expect(Array.from(document.querySelectorAll('md-outlined-button')).some((el) => el.textContent?.includes('Ship instead'))).toBe(true);
  });

  it('tapping Picked up calls markProductPickedUp and reloads', async () => {
    getOrderMock.mockResolvedValue({ data: baseOrder([item()]) });
    markProductPickedUpMock.mockResolvedValue({ data: {} });
    renderAt();
    await screen.findByText('Serum', {}, LONG);

    const btn = Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Picked up'));
    fireEvent.click(btn as HTMLElement);

    await waitFor(() => expect(markProductPickedUpMock).toHaveBeenCalledWith('tok', 'MSD-PR-1'), LONG);
    await waitFor(() => expect(getOrderMock).toHaveBeenCalledTimes(2), LONG);
  });

  it('a completed PRODUCT_PICKUP shows "No QR needed", no action buttons', async () => {
    getOrderMock.mockResolvedValue({
      data: baseOrder([item({ purchaseEntitlements: [{ id: 'ent-1', voucherCode: 'MSD-PR-1', fulfilmentKind: 'PRODUCT_PICKUP', entitlementStatus: 'COMPLETED', settlementStatus: 'ON_HOLD', carrier: null, trackingNumber: null, shippedAt: null, deliveryEvidenceStorageKey: null, deliveryEvidenceNote: null }] })]),
    });
    renderAt();
    await screen.findByText('Serum', {}, LONG);

    expect(screen.getByText('No QR needed')).toBeTruthy();
    expect(Array.from(document.querySelectorAll('md-filled-button')).some((el) => el.textContent?.includes('Picked up'))).toBe(false);
  });

  it('does not offer Picked up/Ship instead without the custom action permission', async () => {
    grantedPermissions = new Set(['vendor-portal.orders:view']);
    getOrderMock.mockResolvedValue({ data: baseOrder([item()]) });
    renderAt();
    await screen.findByText('Serum', {}, LONG);

    expect(Array.from(document.querySelectorAll('md-filled-button')).some((el) => el.textContent?.includes('Picked up'))).toBe(false);
    expect(screen.getByText('Waiting for scan')).toBeTruthy(); // falls through to the generic status badge, not "No QR needed"
  });
});

describe('VendorOrderDetailPage — shipped product row', () => {
  it('a shipped-but-not-delivered line offers Record delivery evidence', async () => {
    getOrderMock.mockResolvedValue({
      data: baseOrder([item({ purchaseEntitlements: [{ id: 'ent-1', voucherCode: 'MSD-PR-1', fulfilmentKind: 'PRODUCT_SHIPPED', entitlementStatus: 'STARTED', settlementStatus: 'PENDING_FULFILMENT', carrier: 'BlueDart', trackingNumber: 'BD123', shippedAt: '2026-11-02T00:00:00.000Z', deliveryEvidenceStorageKey: null, deliveryEvidenceNote: null }] })]),
    });
    renderAt();
    await screen.findByText('Serum', {}, LONG);

    expect(Array.from(document.querySelectorAll('md-outlined-button')).some((el) => el.textContent?.includes('Record delivery evidence'))).toBe(true);
  });

  it('a delivered (COMPLETED) shipped line shows "Completed", no evidence action', async () => {
    getOrderMock.mockResolvedValue({
      data: baseOrder([item({ purchaseEntitlements: [{ id: 'ent-1', voucherCode: 'MSD-PR-1', fulfilmentKind: 'PRODUCT_SHIPPED', entitlementStatus: 'COMPLETED', settlementStatus: 'ON_HOLD', carrier: 'BlueDart', trackingNumber: 'BD123', shippedAt: '2026-11-02T00:00:00.000Z', deliveryEvidenceStorageKey: 'key', deliveryEvidenceNote: null }] })]),
    });
    renderAt();
    await screen.findByText('Serum', {}, LONG);

    expect(screen.getByText('Completed')).toBeTruthy();
    expect(Array.from(document.querySelectorAll('md-outlined-button')).some((el) => el.textContent?.includes('Record delivery evidence'))).toBe(false);
  });
});

describe('VendorOrderDetailPage — deal/therapist (SERVICE_SESSION) row — static, never an action', () => {
  it.each([
    ['ACTIVE', 'Waiting for scan'],
    ['STARTED', 'In service'],
    ['OTP_REQUESTED', 'In service'],
    ['COMPLETED', 'Completed'],
  ])('entitlementStatus %s shows "%s" with no action buttons', async (status, label) => {
    getOrderMock.mockResolvedValue({
      data: baseOrder([item({ itemName: 'Deep Tissue Massage', purchaseEntitlements: [{ id: 'ent-1', voucherCode: 'MSD-DL-1', fulfilmentKind: 'SERVICE_SESSION', entitlementStatus: status, settlementStatus: 'PENDING_FULFILMENT', carrier: null, trackingNumber: null, shippedAt: null, deliveryEvidenceStorageKey: null, deliveryEvidenceNote: null }] })]),
    });
    renderAt();
    await screen.findByText('Deep Tissue Massage', {}, LONG);

    expect(screen.getByText(label)).toBeTruthy();
    expect(document.querySelectorAll('md-filled-button')).toHaveLength(0);
  });
});

describe('VendorOrderDetailPage — load error', () => {
  it('shows an error and a Back to orders button when the order fails to load', async () => {
    getOrderMock.mockRejectedValue(new Error('network down'));
    renderAt();

    expect(await screen.findByRole('alert', {}, LONG)).toBeTruthy();
    expect(Array.from(document.querySelectorAll('md-outlined-button')).some((el) => el.textContent?.includes('Back to orders'))).toBe(true);
  });
});
