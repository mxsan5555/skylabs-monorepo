import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '../../../toast/toast-context';
import type { Order } from '../../../api/orders';

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

const getMyOrderMock = vi.fn();
const cancelMyOrderMock = vi.fn();
vi.mock('../../../api/orders', async () => {
  const actual = await vi.importActual<typeof import('../../../api/orders')>('../../../api/orders');
  return {
    ...actual,
    getMyOrder: (...args: unknown[]) => getMyOrderMock(...args),
    cancelMyOrder: (...args: unknown[]) => cancelMyOrderMock(...args),
  };
});

const raiseDisputeMock = vi.fn();
vi.mock('../../../api/rbac/disputes', async () => {
  const actual = await vi.importActual<typeof import('../../../api/rbac/disputes')>('../../../api/rbac/disputes');
  return {
    ...actual,
    raiseDispute: (...args: unknown[]) => raiseDisputeMock(...args),
  };
});

import { OrderDetail } from './order-detail';

const MASSAGE_ENTITLEMENT_ID = 'entitlement-1';
const PRODUCT_ENTITLEMENT_ID = 'entitlement-2';

function baseOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    type: 'SERVICE',
    status: 'CONFIRMED',
    vendorNameSnapshot: 'ABC Spa',
    branchNameSnapshot: 'Downtown',
    subtotal: '1000.00',
    total: '1000.00',
    cancellationReason: null,
    createdAt: '2026-01-01T00:00:00Z',
    branch: null,
    payments: [{ id: 'pay-1', status: 'PAID', provider: 'RAZORPAY', amount: '1000.00', currency: 'INR', failureReason: null, createdAt: '2026-01-01T00:00:00Z' }],
    items: [
      {
        id: 'item-1',
        dealId: 'deal-1',
        dealPackageId: null,
        therapistId: null,
        therapistPackageId: null,
        productId: null,
        vendorId: 'vendor-1',
        branchId: 'branch-1',
        vendorNameSnapshot: 'ABC Spa',
        branchNameSnapshot: 'Downtown',
        itemName: '60-min Massage',
        itemType: 'SERVICE',
        unitPrice: '1000.00',
        quantity: 1,
        lineTotal: '1000.00',
        durationMinutes: 60,
        entitlements: [
          { id: MASSAGE_ENTITLEMENT_ID, voucherCode: 'MSD-DL-ABC123', fulfilmentKind: 'SERVICE_SESSION', entitlementStatus: 'ACTIVE', dispute: null },
        ],
      },
    ],
    ...overrides,
  } as Order;
}

function renderPage(order: Order = baseOrder()) {
  getMyOrderMock.mockResolvedValue({ data: order });
  return render(
    <ToastProvider>
      <MemoryRouter>
        <OrderDetail />
      </MemoryRouter>
    </ToastProvider>,
  );
}

/** Each entitlement renders as its own `<p class="field-hint">` under
 *  `.cart-vendor-group__entitlements` (the FIRST such `<p>` is just the "Purchase verification"
 *  heading) — `voucherLabel`/`statusLabel`/the status itself/the dispute-or-Raise-Issue tail are
 *  all sibling text fragments inside that ONE `<p>`, never their own elements, so asserting on
 *  this row's full `textContent` (a substring check) is the reliable way to read it — an exact
 *  `getByText` match fails here since no single node's OWN text equals just the status fragment. */
function entitlementRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll('.cart-vendor-group__entitlements p.field-hint')).slice(1) as HTMLElement[];
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Feature: Customer order detail — Purchase Verification (voucher display + Raise Issue)
 * Scenario: each entitlement on an item renders its voucher code + status; an entitlement with
 * no open dispute offers "Raise Issue"; one that already has a dispute shows its status instead
 * (never both, and never affecting a sibling entitlement on the same item).
 *
 * Given: an order item with one or more PurchaseEntitlements
 * When: the order detail page renders
 * Then: voucher code/status show per entitlement row; Raise Issue is offered only while there is
 *       no dispute yet on that specific entitlement
 *
 * Edge cases:
 * - an item with no `entitlements` array at all renders no voucher section (backend degrade)
 * - a dispute on one entitlement never affects a sibling entitlement's own row
 *
 * NOTE on coverage: the Raise Issue dialog's reason/description inputs use the shared-ui
 * `OutlinedTextField` REACT WRAPPER (not a raw `createElement('md-outlined-text-field', ...)`
 * element, unlike e.g. `vendor-user-picker.tsx`). Per this repo's own documented Vitest
 * limitation (CLAUDE.md "Testing gotchas" — `@lit/react` resolves to its Node/SSR build under
 * Vitest, so these wrappers never attach a working native event listener in jsdom), typing into
 * that field via `fireEvent.input` cannot be driven in a unit test — confirmed empirically: doing
 * so never reaches `raiseDispute`. This suite therefore verifies the submit GUARD (empty reason
 * never calls the API) rather than a full type-and-submit flow; full dialog-submission coverage
 * would need the dialog's fields switched to raw elements, same as `vendor-user-picker.tsx`.
 */
describe('OrderDetail — Purchase Verification', () => {
  it('renders the voucher code, status, and a Raise Issue action for an undisputed entitlement', async () => {
    renderPage();
    await screen.findByText('60-min Massage');

    expect(screen.getByText('MSD-DL-ABC123')).toBeTruthy();
    const rows = entitlementRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Not started yet');
    expect(screen.getByText('Raise Issue')).toBeTruthy();
  });

  it('shows the dispute status instead of "Raise Issue" once a dispute already exists on that entitlement', async () => {
    renderPage(
      baseOrder({
        items: [
          {
            ...baseOrder().items[0],
            entitlements: [
              {
                id: MASSAGE_ENTITLEMENT_ID,
                voucherCode: 'MSD-DL-ABC123',
                fulfilmentKind: 'SERVICE_SESSION',
                entitlementStatus: 'COMPLETED',
                dispute: { id: 'dispute-1', status: 'OPEN' },
              },
            ],
          },
        ],
      }),
    );
    await screen.findByText('60-min Massage');

    const rows = entitlementRows();
    expect(rows[0].textContent).toContain('Issue raised — pending review');
    expect(screen.queryByText('Raise Issue')).toBeNull();
  });

  it('renders nothing extra for an item with no entitlements at all (backend degrade)', async () => {
    renderPage(baseOrder({ items: [{ ...baseOrder().items[0], entitlements: undefined }] }));
    await screen.findByText('60-min Massage');

    expect(screen.queryByText('Purchase verification')).toBeNull();
    expect(screen.queryByText('Raise Issue')).toBeNull();
    expect(document.querySelector('.cart-vendor-group__entitlements')).toBeNull();
  });

  it('a disputed entitlement never affects a sibling entitlement on the same item — each row is independent', async () => {
    renderPage(
      baseOrder({
        items: [
          {
            ...baseOrder().items[0],
            entitlements: [
              { id: MASSAGE_ENTITLEMENT_ID, voucherCode: 'MSD-DL-ABC123', fulfilmentKind: 'SERVICE_SESSION', entitlementStatus: 'COMPLETED', dispute: { id: 'd1', status: 'OPEN' } },
              { id: PRODUCT_ENTITLEMENT_ID, voucherCode: 'MSD-PR-XYZ789', fulfilmentKind: 'PRODUCT_PICKUP', entitlementStatus: 'ACTIVE', dispute: null },
            ],
          },
        ],
      }),
    );
    await screen.findByText('60-min Massage');

    const rows = entitlementRows();
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('MSD-DL-ABC123');
    expect(rows[0].textContent).toContain('Issue raised — pending review');
    expect(rows[1].textContent).toContain('MSD-PR-XYZ789');
    expect(rows[1].textContent).not.toContain('Issue raised');
    // Only the undisputed sibling (row 2) offers Raise Issue — exactly one button on the page.
    expect(screen.getAllByText('Raise Issue')).toHaveLength(1);
  });

  it('opens the Raise Issue dialog with the right title on click', async () => {
    renderPage();
    await screen.findByText('60-min Massage');

    fireEvent.click(screen.getByText('Raise Issue'));

    expect(await screen.findByText('Raise an issue')).toBeTruthy();
  });

  it('clicking Submit with no reason entered never calls raiseDispute (the submit-guard in submitRaiseIssue)', async () => {
    renderPage();
    await screen.findByText('60-min Massage');

    fireEvent.click(screen.getByText('Raise Issue'));
    await screen.findByText('Raise an issue');
    fireEvent.click(screen.getByText('Submit'));

    expect(raiseDisputeMock).not.toHaveBeenCalled();
  });
});
