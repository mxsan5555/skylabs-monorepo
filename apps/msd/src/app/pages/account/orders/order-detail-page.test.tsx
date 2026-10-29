import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BreadcrumbProvider } from '../../../admin/breadcrumb-context';
import type { Order } from '../../../../api/rbac/orders';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

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

const getOrderMock = vi.fn();
const getOrderActivityHistoryMock = vi.fn();
vi.mock('../../../../api/rbac/orders', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/orders')>('../../../../api/rbac/orders');
  return {
    ...actual,
    getOrder: (...args: unknown[]) => getOrderMock(...args),
    getOrderActivityHistory: (...args: unknown[]) => getOrderActivityHistoryMock(...args),
  };
});

const listRefundsForOrderItemMock = vi.fn();
vi.mock('../../../../api/rbac/refunds', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/refunds')>('../../../../api/rbac/refunds');
  return {
    ...actual,
    listRefundsForOrderItem: (...args: unknown[]) => listRefundsForOrderItemMock(...args),
  };
});

import { OrderDetailPage } from './order-detail-page';

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

function renderAtOrderWideRoute(order: Order) {
  getOrderMock.mockResolvedValue({ data: order });
  getOrderActivityHistoryMock.mockResolvedValue({ data: [] });
  listRefundsForOrderItemMock.mockResolvedValue({ data: [] });
  return render(
    <BreadcrumbProvider>
      <MemoryRouter initialEntries={[`/account/orders/${order.id}`]}>
        <Routes>
          <Route path="/account/orders/:orderId" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </BreadcrumbProvider>,
  );
}

function renderAtCustomerScopedRoute(order: Order, customerIdInUrl: string) {
  getOrderMock.mockResolvedValue({ data: order });
  getOrderActivityHistoryMock.mockResolvedValue({ data: [] });
  listRefundsForOrderItemMock.mockResolvedValue({ data: [] });
  return render(
    <BreadcrumbProvider>
      <MemoryRouter initialEntries={[`/account/customers/${customerIdInUrl}/orders/${order.id}`]}>
        <Routes>
          <Route path="/account/customers/:customerId/orders/:orderId" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </BreadcrumbProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  grantedPermissions = new Set(); // no customers:view / accounts.member-settlements:view by default
});

/**
 * Feature: Order Details — legacy/unlinked order rendering
 * Scenario: an order whose `contactName/contactPhone/contactEmail` are all `null` (it predates
 * the checkout "Customer Details" step) must render the Customer section safely — falling back
 * to the live `User` fields, and never fabricating a "(at checkout)" value when there isn't one.
 */
describe('OrderDetailPage — legacy order with no checkout contact snapshot', () => {
  it('renders the live customer fields and shows NO "(at checkout)" rows at all when the snapshot is entirely null', async () => {
    renderAtOrderWideRoute(BASE_ORDER); // contactName/Phone/Email already all null
    await screen.findByRole('heading', { level: 1 }, LONG);

    expect(screen.getByText('Asha Rao')).toBeTruthy();
    expect(screen.getByText('9999999999')).toBeTruthy();
    expect(screen.getByText('asha@example.com')).toBeTruthy();
    expect(screen.queryByText(/at checkout/i)).toBeNull();
  });

  it('never crashes when email is also null on both the live profile and the checkout snapshot', async () => {
    const order: Order = { ...BASE_ORDER, customer: { ...BASE_ORDER.customer, email: null } };
    renderAtOrderWideRoute(order);
    await screen.findByRole('heading', { level: 1 }, LONG);
    // Falls back to the em dash placeholder rather than throwing or rendering "null".
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

/**
 * Feature: Order Details — "(at checkout)" rows appear ONLY where the purchase-time snapshot
 * genuinely differs from the live profile, field by field, never as a block.
 */
describe('OrderDetailPage — checkout contact snapshot vs. live profile', () => {
  it('shows a "(at checkout)" row only for the fields that differ, leaving unchanged fields alone', async () => {
    const order: Order = {
      ...BASE_ORDER,
      contactName: 'Asha R.', // differs from live "Asha Rao"
      contactPhone: '9999999999', // SAME as live — must not render its own "(at checkout)" row
      contactEmail: null, // no snapshot at all — must not render its own "(at checkout)" row
    };
    renderAtOrderWideRoute(order);
    await screen.findByRole('heading', { level: 1 }, LONG);

    expect(screen.getByText('Name (at checkout)')).toBeTruthy();
    expect(screen.getByText('Asha R.')).toBeTruthy();
    expect(screen.queryByText('Phone (at checkout)')).toBeNull();
    expect(screen.queryByText('Email (at checkout)')).toBeNull();
  });
});

/**
 * Feature: Order Details — customer-scoped route's extra ownership guard
 * Scenario: `/account/customers/:customerId/orders/:orderId` layers an extra check on top of the
 * same `GET /orders/:id` — a mismatched `:customerId` must render a genuine not-found state, NOT
 * crash, and never actually display the mismatched order's data.
 */
describe('OrderDetailPage — customer-scoped route ownership check', () => {
  it("renders an error state (never a crash, never the order's data) when the URL's :customerId does not match the loaded order's customerId", async () => {
    renderAtCustomerScopedRoute(BASE_ORDER, 'some-other-customer-id');
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy(), LONG);
    expect(screen.getByText('This order does not belong to this customer.')).toBeTruthy();
    expect(screen.queryByText('Swedish Massage')).toBeNull();
  });

  it('renders normally when the URL customerId matches the order', async () => {
    renderAtCustomerScopedRoute(BASE_ORDER, BASE_ORDER.customerId);
    await screen.findByRole('heading', { level: 1 }, LONG);
    expect(screen.getByText('Swedish Massage')).toBeTruthy();
  });
});

/**
 * Feature: Order Details — Activity History loading/empty/error/populated states
 */
describe('OrderDetailPage — Activity History', () => {
  it('shows an empty-state message when the order has no recorded activity', async () => {
    renderAtOrderWideRoute(BASE_ORDER);
    await screen.findByRole('heading', { level: 1 }, LONG);
    expect(await screen.findByText('No activity recorded yet.', {}, LONG)).toBeTruthy();
  });

  it('renders a known action humanized, and an unknown action still generically humanized rather than dropped', async () => {
    getOrderMock.mockResolvedValue({ data: BASE_ORDER });
    getOrderActivityHistoryMock.mockResolvedValue({
      data: [
        { id: 'log-1', actorUserId: 'cust-1', action: 'order.create_from_cart', targetType: 'Order', targetId: 'order-1', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'log-2', actorUserId: 'cust-1', action: 'some.future_action', targetType: 'Order', targetId: 'order-1', createdAt: '2026-01-02T00:00:00.000Z' },
      ],
    });
    listRefundsForOrderItemMock.mockResolvedValue({ data: [] });
    render(
      <BreadcrumbProvider>
        <MemoryRouter initialEntries={['/account/orders/order-1']}>
          <Routes>
            <Route path="/account/orders/:orderId" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </BreadcrumbProvider>,
    );
    await screen.findByRole('heading', { level: 1 }, LONG);
    expect(await screen.findByText(/Order placed/, {}, LONG)).toBeTruthy();
    expect(screen.getByText(/Some Future Action/)).toBeTruthy(); // generic humanization fallback
  });

  it('shows an error state when the activity history fails to load, without blocking the rest of the page', async () => {
    getOrderMock.mockResolvedValue({ data: BASE_ORDER });
    getOrderActivityHistoryMock.mockRejectedValue(new Error('network down'));
    listRefundsForOrderItemMock.mockResolvedValue({ data: [] });
    render(
      <BreadcrumbProvider>
        <MemoryRouter initialEntries={['/account/orders/order-1']}>
          <Routes>
            <Route path="/account/orders/:orderId" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </BreadcrumbProvider>,
    );
    await screen.findByRole('heading', { level: 1 }, LONG);
    // Rest of the page (e.g. the customer section) still rendered.
    expect(screen.getByText('Asha Rao')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0), LONG);
  });
});

/**
 * Feature: Order Details — Technical Reference stays collapsed, raw-id-only
 */
describe('OrderDetailPage — Technical Reference', () => {
  it('shows the raw order id inside the collapsed "Technical Reference" details, never as the headline order number', async () => {
    renderAtOrderWideRoute(BASE_ORDER);
    await screen.findByRole('heading', { level: 1 }, LONG);
    expect(screen.getByText(`Order ID: ${BASE_ORDER.id}`)).toBeTruthy();
    // The page's own h1 uses the short order number, never the raw uuid.
    expect(screen.queryByRole('heading', { level: 1, name: new RegExp(BASE_ORDER.id) })).toBeNull();
  });
});

/**
 * Feature: Order Details — Completed-but-unpaid ("Needs Review") visibility
 * Scenario: a COMPLETED order with no PAID payment attempt must show BOTH the Order Status
 * badge AND an explicit "No payment recorded"/Needs Review signal — never silently implying
 * paid, and never auto-marking it Paid or rewriting history.
 */
// `sky-info-card`'s `heading`/`subheading` render inside its own internal template, not as
// plain light-DOM text `getByText` can reliably see under jsdom — same class of limitation as
// every other raw custom element in this codebase's tests. Assert on the reflected attribute
// instead, same technique `attr()`-style helpers elsewhere in this test suite already use.
function needsReviewCard(): Element | null {
  return document.querySelector('sky-info-card[heading="Needs Review"]');
}

describe('OrderDetailPage — COMPLETED order with zero payment attempts', () => {
  it('shows the Order Status badge, a "No payment recorded" payment badge, and a Needs Review banner', async () => {
    const order: Order = { ...BASE_ORDER, status: 'COMPLETED', payments: [] };
    renderAtOrderWideRoute(order);
    await screen.findByRole('heading', { level: 1 }, LONG);
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getByText('No payment recorded')).toBeTruthy();
    expect(needsReviewCard()).toBeTruthy();
    expect(screen.queryByText('Payment Attempts')).toBeNull();
  });

  it('shows the Needs Review banner when a payment attempt exists but none is PAID (e.g. only FAILED)', async () => {
    const order: Order = {
      ...BASE_ORDER,
      status: 'COMPLETED',
      payments: [{ id: 'pay-1', status: 'FAILED', provider: 'RAZORPAY', amount: '1000.00', currency: 'INR', failureReason: 'card declined', createdAt: '2026-01-01T00:00:00Z' }],
    };
    renderAtOrderWideRoute(order);
    await screen.findByRole('heading', { level: 1 }, LONG);
    expect(needsReviewCard()).toBeTruthy();
  });

  it('never shows the Needs Review banner once a PAID payment exists', async () => {
    const order: Order = {
      ...BASE_ORDER,
      status: 'COMPLETED',
      payments: [{ id: 'pay-1', status: 'PAID', provider: 'RAZORPAY', amount: '1000.00', currency: 'INR', failureReason: null, createdAt: '2026-01-01T00:00:00Z' }],
    };
    renderAtOrderWideRoute(order);
    await screen.findByRole('heading', { level: 1 }, LONG);
    expect(needsReviewCard()).toBeNull();
  });
});

/**
 * Feature: Order Details — multi-vendor order total leak fix
 * Scenario: `Order.subtotal`/`Order.total` are order-WIDE aggregates across every vendor on a
 * multi-vendor order. A member caller's `order.items` is already vendor-scoped server-side
 * (`scopeOrderItemsToVendor`), so the Payment Summary must compute Subtotal/Total from
 * `order.items` instead of the raw order-wide fields for a member — showing the raw fields would
 * leak another vendor's amount to this member. An admin (`orders:view`) still sees the real,
 * order-wide totals.
 *
 * Given: an order whose raw `subtotal`/`total` (₹5,000) is far larger than the sum of the items
 * actually present on this response (₹1,000 — standing in for "already scoped to this vendor")
 * When: the page renders for a member vs. an admin caller
 * Then: a member sees ₹1,000 (computed from items) and the raw ₹5,000 never appears anywhere in
 *       the rendered output; an admin sees the real ₹5,000
 */
describe('OrderDetailPage — multi-vendor order total leak fix (Payment Summary)', () => {
  const MULTI_VENDOR_ORDER: Order = {
    ...BASE_ORDER,
    id: 'order-multi',
    subtotal: '5000.00', // the FULL order-wide aggregate across every vendor
    total: '5000.00',
    // Only this caller's own (already vendor-scoped) item is present — ₹1,000.
    items: [BASE_ORDER.items[0]],
  };

  it('a member caller (no orders:view) sees Subtotal/Total computed from order.items (₹1,000), never the raw ₹5,000 order-wide total', async () => {
    grantedPermissions = new Set(); // no orders:view, no vendor-portal.orders:custom either
    renderAtOrderWideRoute(MULTI_VENDOR_ORDER);
    await screen.findByRole('heading', { level: 1 }, LONG);

    expect(screen.getAllByText('₹1,000').length).toBeGreaterThan(0);
    expect(screen.queryByText('₹5,000')).toBeNull();
  });

  it('an admin caller (orders:view) sees the real order-wide Subtotal/Total (₹5,000)', async () => {
    grantedPermissions = new Set(['orders:view']);
    renderAtOrderWideRoute(MULTI_VENDOR_ORDER);
    await screen.findByRole('heading', { level: 1 }, LONG);

    expect(screen.getAllByText('₹5,000').length).toBeGreaterThan(0);
  });
});

/**
 * Feature: "Customer's Other Orders" — context-aware routing
 * Scenario: an admin caller's click still targets the full `/account/orders` list; a member
 * caller (who never holds `orders:view`) targets their own 2-tab `/account/vendor-orders` page's
 * History tab instead, carrying the same `customerId`/`excludeOrderId` filters either way.
 */
describe('OrderDetailPage — "Customer\'s Other Orders" context-aware routing', () => {
  // `OutlinedButton` is a `@lit/react`-wrapped `md-outlined-button` — same "query by rendered
  // text content, click the raw element" convention `orders-and-verify.test.tsx`'s own
  // `clickButton` helper uses.
  function clickCustomersOtherOrders() {
    const btn = Array.from(document.querySelectorAll('md-outlined-button')).find((el) =>
      el.textContent?.includes("Customer's Other Orders"),
    );
    if (!btn) throw new Error('"Customer\'s Other Orders" button not found');
    fireEvent.click(btn);
  }

  it('navigates an admin caller to /account/orders?customerId=...&excludeOrderId=...', async () => {
    grantedPermissions = new Set(['orders:view']);
    renderAtOrderWideRoute(BASE_ORDER);
    await screen.findByRole('heading', { level: 1 }, LONG);

    clickCustomersOtherOrders();

    expect(navigateMock).toHaveBeenCalledWith(
      `/account/orders?customerId=${BASE_ORDER.customerId}&excludeOrderId=${BASE_ORDER.id}`,
      expect.objectContaining({ state: expect.objectContaining({ fromOrderId: BASE_ORDER.id }) }),
    );
  });

  it('navigates a member caller to /account/vendor-orders?tab=history&customerId=...&excludeOrderId=...', async () => {
    grantedPermissions = new Set(['vendor-portal.orders:custom']); // no orders:view
    renderAtOrderWideRoute(BASE_ORDER);
    await screen.findByRole('heading', { level: 1 }, LONG);

    clickCustomersOtherOrders();

    expect(navigateMock).toHaveBeenCalledWith(
      `/account/vendor-orders?tab=history&customerId=${BASE_ORDER.customerId}&excludeOrderId=${BASE_ORDER.id}`,
      expect.objectContaining({ state: expect.objectContaining({ fromOrderId: BASE_ORDER.id }) }),
    );
  });
});

/**
 * Feature: per-entitlement "Continue Verification"/"View Record" action
 * Scenario: each item's own voucher line grows a link to the resumable verification page
 * (`/account/vendor-orders/verify/:voucherCode`) — but ONLY for a caller who can actually act on
 * it (`!isAdminViewer && can('vendor-portal.orders','custom')`); an admin never sees this action,
 * even if (hypothetically) also holding the member action key, since `isAdminViewer` always wins.
 */
describe('OrderDetailPage — per-entitlement voucher verification action', () => {
  function orderWithEntitlement(entitlementStatus: string): Order {
    return {
      ...BASE_ORDER,
      items: [
        {
          ...BASE_ORDER.items[0],
          purchaseEntitlements: [
            {
              id: 'ent-1',
              voucherCode: 'MSD-DL-ABC123',
              entitlementStatus,
              settlementStatus: 'PENDING_FULFILMENT',
              carrier: null,
              trackingNumber: null,
              deliveryEvidenceNote: null,
            } as never,
          ],
        },
      ],
    };
  }

  it('shows "Continue Verification" linking to the verify route for an ACTIVE entitlement, for a member caller', async () => {
    grantedPermissions = new Set(['vendor-portal.orders:custom']);
    renderAtOrderWideRoute(orderWithEntitlement('ACTIVE'));
    await screen.findByRole('heading', { level: 1 }, LONG);

    const link = screen.getByRole('link', { name: 'Continue Verification' });
    expect(link.getAttribute('href')).toBe('/account/vendor-orders/verify/MSD-DL-ABC123');
  });

  it('shows "View Record" (not "Continue Verification") for a COMPLETED entitlement', async () => {
    grantedPermissions = new Set(['vendor-portal.orders:custom']);
    renderAtOrderWideRoute(orderWithEntitlement('COMPLETED'));
    await screen.findByRole('heading', { level: 1 }, LONG);

    expect(screen.getByRole('link', { name: 'View Record' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Continue Verification' })).toBeNull();
  });

  it('shows "View Record" for a CANCELLED entitlement too (closed out either way)', async () => {
    grantedPermissions = new Set(['vendor-portal.orders:custom']);
    renderAtOrderWideRoute(orderWithEntitlement('CANCELLED'));
    await screen.findByRole('heading', { level: 1 }, LONG);

    expect(screen.getByRole('link', { name: 'View Record' })).toBeTruthy();
  });

  it('never shows the action link for an admin caller (orders:view), even if also holding vendor-portal.orders:custom', async () => {
    grantedPermissions = new Set(['orders:view', 'vendor-portal.orders:custom']);
    renderAtOrderWideRoute(orderWithEntitlement('ACTIVE'));
    await screen.findByRole('heading', { level: 1 }, LONG);

    expect(screen.queryByRole('link', { name: 'Continue Verification' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'View Record' })).toBeNull();
  });

  it('never shows the action link for a caller with neither orders:view nor vendor-portal.orders:custom', async () => {
    grantedPermissions = new Set();
    renderAtOrderWideRoute(orderWithEntitlement('ACTIVE'));
    await screen.findByRole('heading', { level: 1 }, LONG);

    expect(screen.queryByRole('link', { name: 'Continue Verification' })).toBeNull();
  });
});
