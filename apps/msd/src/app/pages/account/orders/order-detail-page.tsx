import '../vendor-portal/member-portal.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CircularProgress, Divider, FilledButton, Icon, OutlinedButton } from '@skylabs-monorepo/shared-ui/react';
import type { AuditLogEntry } from '@skylabs-monorepo/shared-types';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getOrder, getOrderActivityHistory, shortOrderNumber, type Order } from '../../../../api/rbac/orders';
import { listRefundsForOrderItem, type Refund } from '../../../../api/rbac/refunds';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useSetBreadcrumbs } from '../../../admin/breadcrumb-context';
import { formatINR } from '../../../../utils/format';
import { customerDisplayName } from '../customers/customer-list';
import '../../cart/cart.css';

const ORDER_STATUS_LABEL: Record<Order['status'], string> = {
  PENDING_PAYMENT: 'Pending Payment',
  CONFIRMED: 'Confirmed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

/** `sky-badge`'s real variant set is `primary|secondary|tertiary|error` only (never
 *  success/warning/info — those are `sky-data-table`'s own status-column vocabulary) — same
 *  "good/in-progress/bad" grouping `vendor-detail-page.tsx`'s `statusBadgeVariant` already uses. */
const ORDER_STATUS_BADGE: Record<Order['status'], 'primary' | 'secondary' | 'tertiary' | 'error'> = {
  PENDING_PAYMENT: 'tertiary',
  CONFIRMED: 'secondary',
  COMPLETED: 'primary',
  CANCELLED: 'error',
};

const PAYMENT_STATUS_BADGE: Record<string, 'primary' | 'secondary' | 'tertiary' | 'error'> = {
  CREATED: 'secondary',
  PAID: 'primary',
  FAILED: 'error',
  CANCELLED: 'tertiary',
};

const ENTITLEMENT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  STARTED: 'Started',
  OTP_REQUESTED: 'OTP Requested',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

/** Known, real `AuditLog.action` strings this order's activity feed can surface (order/payment/
 *  voucher/dispute/refund/payout events — see msd-api's `getOrderActivityHistory` doc comment).
 *  Anything else still renders — generically humanized, never dropped — so a future action string
 *  this list hasn't caught up with still shows something readable instead of disappearing. */
const ACTIVITY_LABEL: Record<string, string> = {
  'order.create_from_cart': 'Order placed',
  'order.self_cancel': 'Cancelled by customer',
  'order.status_change': 'Order status changed',
  'payment.cod_confirmed': 'Cash-on-delivery payment confirmed',
  'payment.verified': 'Payment verified',
  'voucher.start': 'Service started',
  'voucher.complete': 'Service/voucher completed',
  'voucher.ship': 'Item shipped',
  'voucher.record_delivery_evidence': 'Delivery evidence recorded',
  'dispute.raise': 'Dispute raised',
  'dispute.resolve': 'Dispute resolved',
  'dispute.status_change': 'Dispute status changed',
  'refund.create': 'Refund recorded',
  'settlement.payout.recorded': 'Member payout recorded',
};

function humanizeAction(action: string): string {
  if (ACTIVITY_LABEL[action]) return ACTIVITY_LABEL[action];
  return action
    .split(/[._]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** `null`/empty checkout snapshot never counts as "different" — most pre-checkout-step orders
 *  simply have no snapshot at all (see api/rbac/orders.ts's `contactName/Phone/Email` doc
 *  comment), which must never render as a false "changed since checkout" banner. */
function checkoutDiffers(live: string | null, snapshot: string | null): boolean {
  return Boolean(snapshot) && snapshot !== live;
}

/** "Continue Verification" while there's still something to do on this voucher; "View Record"
 *  once it's closed out (completed, or cancelled/refunded — nothing left to continue either way). */
function voucherActionLabel(entitlementStatus: string): string {
  return entitlementStatus === 'ACTIVE' || entitlementStatus === 'STARTED' || entitlementStatus === 'OTP_REQUESTED'
    ? 'Continue Verification'
    : 'View Record';
}

interface BackState {
  backTo?: string;
}

/**
 * Generalized, read-only Order Detail — serves BOTH `/account/orders/:orderId` (any admin/vendor
 * holding order-view) and `/account/customers/:customerId/orders/:orderId` (the customer-scoped
 * route, which layers its own ownership check on top of the same `GET /orders/:id`: a mismatched
 * `:customerId` renders a genuine not-found, never a different customer's order). One
 * implementation serves both routes — see the approved plan's "generalize rather than fork" note;
 * this replaces the old customer-only `CustomerOrderDetailPage`.
 */
export function OrderDetailPage() {
  const { customerId, orderId = '' } = useParams<{ customerId?: string; orderId: string }>();
  const { token, can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const canViewCustomers = can('customers', 'view');
  // A member (vendor caller) never holds `orders:view` — only `vendor-portal.orders:custom` (see
  // routes.tsx's `OrderDetailRouteGuard` doc comment, the matching Bug-1 fix for this same page).
  const isAdminViewer = can('orders', 'view');
  const canActOnVouchers = !isAdminViewer && can('vendor-portal.orders', 'custom');

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [activity, setActivity] = useState<AuditLogEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState('');

  const [refunds, setRefunds] = useState<Refund[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await getOrder(token, orderId);
      if (customerId && data.customerId !== customerId) {
        setOrder(null);
        setError('This order does not belong to this customer.');
        return;
      }
      setOrder(data);
    } catch (err) {
      setOrder(null);
      setError(err instanceof ApiRequestError ? err.message : 'Could not load this order.');
    } finally {
      setLoading(false);
    }
  }, [token, orderId, customerId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!order) return;
    setActivityLoading(true);
    setActivityError('');
    getOrderActivityHistory(token, order.id)
      .then(({ data }) => setActivity(data))
      .catch((err) => setActivityError(err instanceof ApiRequestError ? err.message : 'Could not load activity history.'))
      .finally(() => setActivityLoading(false));
  }, [token, order]);

  // Refund info, if any — a plain-array merge of each item's own refunds (no dedicated
  // "refunds for this order" endpoint exists; see api/rbac/refunds.ts's own doc comment). A
  // single item's lookup failing never blocks the others from showing.
  useEffect(() => {
    if (!order || order.items.length === 0) {
      setRefunds([]);
      return;
    }
    Promise.all(
      order.items.map((item) =>
        listRefundsForOrderItem(token, item.id)
          .then(({ data }) => data)
          .catch(() => [] as Refund[]),
      ),
    ).then((lists) => setRefunds(lists.flat()));
  }, [token, order]);

  const backTo =
    (location.state as BackState | null)?.backTo ??
    (customerId ? `/account/customers/${customerId}/orders` : isAdminViewer ? '/account/orders' : '/account/vendor-orders?tab=history');

  useSetBreadcrumbs(
    order
      ? customerId
        ? [
            { label: 'Customers', to: '/account/customers' },
            { label: customerDisplayName(order.customer), to: `/account/customers/${customerId}` },
            { label: 'Orders', to: `/account/customers/${customerId}/orders` },
            { label: `Order #${shortOrderNumber(order.id)}` },
          ]
        : [
            { label: 'Orders', to: '/account/orders' },
            { label: `Order #${shortOrderNumber(order.id)}` },
          ]
      : [],
  );

  const paidAmount = useMemo(
    () => (order ? order.payments.filter((p) => p.status === 'PAID').reduce((sum, p) => sum + Number(p.amount), 0) : 0),
    [order],
  );

  // `Order.subtotal`/`Order.total` are order-WIDE aggregates across every vendor on a
  // multi-vendor order. `order.items` is already vendor-scoped server-side for a vendor caller
  // (`getOrderOrThrow`'s `scopeOrderItemsToVendor`) — showing the raw order-wide fields to a
  // member would leak other vendors' amounts, so a member sees the sum of their own (already
  // scoped) items instead. An admin still sees the real order-wide totals.
  const { subtotalDisplay, totalDisplay } = useMemo(() => {
    if (!order) return { subtotalDisplay: 0, totalDisplay: 0 };
    if (isAdminViewer) return { subtotalDisplay: Number(order.subtotal), totalDisplay: Number(order.total) };
    const itemsTotal = order.items.reduce((sum, item) => sum + Number(item.lineTotal), 0);
    return { subtotalDisplay: itemsTotal, totalDisplay: itemsTotal };
  }, [order, isAdminViewer]);

  // "Customer's Other Orders" (Customer card) opens the full, filterable Order History page
  // instead of an inline table — see orders.tsx's own `customerId`/`excludeOrderId` handling.
  // Context-aware target: an admin lands on the full `/account/orders` list; a member (who never
  // holds `orders:view`) lands on their own 2-tab `/account/vendor-orders` page's History tab —
  // same `OrderManagement` component either way, just a different route/scope wrapping it.
  const openCustomersOtherOrders = useCallback(() => {
    if (!order?.customerId) return;
    const target = isAdminViewer
      ? `/account/orders?customerId=${order.customerId}&excludeOrderId=${order.id}`
      : `/account/vendor-orders?tab=history&customerId=${order.customerId}&excludeOrderId=${order.id}`;
    navigate(target, {
      state: {
        fromOrderId: order.id,
        fromOrderBackTo: `${location.pathname}${location.search}`,
        customerName: order.customer.name,
        customerPhone: order.customer.phone,
      },
    });
  }, [navigate, order, location.pathname, location.search, isAdminViewer]);

  if (loading) {
    return (
      <div className="order-loading">
        <CircularProgress indeterminate aria-label="Loading order" />
        <p>Loading order…</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="admin-page admin-page--wide member-portal">
        <meta name="robots" content="noindex" />
        <p className="error-state" role="alert">{error || 'Order not found.'}</p>
        <Link to={backTo}>Back to Orders</Link>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page--wide member-portal">
      <title>{`Order #${shortOrderNumber(order.id)} · MSD`}</title>
      <meta name="robots" content="noindex" />

      <header className="page-head">
        <div>
          <h1>Order #{shortOrderNumber(order.id)}</h1>
          <p className="field-hint">
            Placed {new Date(order.createdAt).toLocaleString()}
            {' · '}
            <sky-badge variant={ORDER_STATUS_BADGE[order.status]}>{ORDER_STATUS_LABEL[order.status]}</sky-badge>
            {' · '}
            {order.payments[0] ? (
              <sky-badge variant={PAYMENT_STATUS_BADGE[order.payments[0].status] ?? 'secondary'}>{order.payments[0].status}</sky-badge>
            ) : (
              <sky-badge variant="secondary">No payment recorded</sky-badge>
            )}
          </p>
        </div>
        <div className="page-head__actions">
          {customerId && (order.status === 'CONFIRMED' || order.status === 'COMPLETED') && (
            <FilledButton onClick={() => navigate(`/account/customers/${customerId}/orders/${order.id}/invoice`)}>
              View Invoice
            </FilledButton>
          )}
          <OutlinedButton onClick={() => navigate(backTo)}>
            <Icon slot="icon" aria-hidden="true">arrow_back</Icon>Back to Orders
          </OutlinedButton>
        </div>
      </header>

      {order.cancellationReason && (
        <sky-info-card icon="cancel" heading="Order cancelled" subheading={order.cancellationReason} />
      )}

      {order.status === 'COMPLETED' && !order.payments.some((p) => p.status === 'PAID') && (
        <sky-info-card
          icon="error"
          heading="Needs Review"
          subheading="This order is marked Completed but has no confirmed (PAID) payment on record. Voucher completion and member payout for this order remain subject to the usual restrictions — completing the order never marks it Paid on its own."
        />
      )}

      <div className="summary-layout summary-layout--balanced">
        <section aria-labelledby="order-customer-title">
          <h2 id="order-customer-title" className="section-title">Customer</h2>
          <sky-card variant="outlined">
            <div className="cart-summary">
              <div className="cart-summary__row"><span>Name</span><span>{customerDisplayName(order.customer)}</span></div>
              <div className="cart-summary__row"><span>Phone</span><span>{order.customer.phone ?? '—'}</span></div>
              <div className="cart-summary__row"><span>Email</span><span>{order.customer.email ?? '—'}</span></div>

              {checkoutDiffers(order.customer.name, order.contactName) && (
                <div className="cart-summary__row"><span>Name (at checkout)</span><span>{order.contactName}</span></div>
              )}
              {checkoutDiffers(order.customer.phone, order.contactPhone) && (
                <div className="cart-summary__row"><span>Phone (at checkout)</span><span>{order.contactPhone}</span></div>
              )}
              {checkoutDiffers(order.customer.email, order.contactEmail) && (
                <div className="cart-summary__row"><span>Email (at checkout)</span><span>{order.contactEmail}</span></div>
              )}

              <div className="cart-summary__actions">
                {(canViewCustomers || can('vendor-portal.customers', 'view')) && (
                  <OutlinedButton onClick={() => navigate(
                    canViewCustomers ? `/account/customers/${order.customerId}` : `/account/vendor-customers/${order.customerId}`,
                    { state: { fromOrderBackTo: `${location.pathname}${location.search}` } },
                  )}>View Customer</OutlinedButton>
                )}
                {order.customerId ? (
                  <OutlinedButton onClick={openCustomersOtherOrders}>Customer's Other Orders</OutlinedButton>
                ) : (
                  <p className="field-hint">Customer link unavailable</p>
                )}
              </div>
            </div>
          </sky-card>
        </section>

        <section aria-labelledby="order-payment-summary-title">
          <h2 id="order-payment-summary-title" className="section-title">Payment Summary</h2>
          <sky-card variant="outlined">
            <div className="cart-summary">
              <div className="cart-summary__row"><span>Subtotal</span><span>{formatINR(subtotalDisplay)}</span></div>
              <Divider />
              <div className="cart-summary__row cart-summary__row--total"><strong>Total</strong><strong>{formatINR(totalDisplay)}</strong></div>
              <div className="cart-summary__row"><span>Amount Paid</span><span>{formatINR(paidAmount)}</span></div>
              {order.payments[0] && (
                <div className="cart-summary__row">
                  <span>Payment Reference</span>
                  <span>{order.payments[0].provider} · {order.payments[0].status}</span>
                </div>
              )}
            </div>
          </sky-card>
        </section>
      </div>

      <section aria-labelledby="order-items-title">
        <h2 id="order-items-title" className="section-title">Purchased Items</h2>
        <sky-card variant="outlined" className="member-items-card">
          <div className="member-table-scroll">
            <table className="member-items-table">
              <caption className="sr-only">Purchased Items</caption>
              <thead><tr><th scope="col">Item</th><th scope="col">Qty</th><th scope="col">Amount</th><th scope="col">Voucher / Status</th><th scope="col">Action</th></tr></thead>
              <tbody>
                {order.items.flatMap((item) => (item.purchaseEntitlements.length ? item.purchaseEntitlements : [null]).map((ent, index) => (
                  <tr key={ent?.id ?? item.id}>
                    <td>{item.itemName}</td>
                    <td>{index === 0 ? item.quantity : '?'}</td>
                    <td>{index === 0 ? formatINR(Number(item.lineTotal)) : '?'}</td>
                    <td>{ent ? <>{ent.voucherCode}<span className="member-table-secondary">{ENTITLEMENT_STATUS_LABEL[ent.entitlementStatus] ?? ent.entitlementStatus}</span></> : 'No voucher'}</td>
                    <td>{ent && canActOnVouchers && <Link to={`/account/vendor-orders/verify/${encodeURIComponent(ent.voucherCode)}`}>{voucherActionLabel(ent.entitlementStatus)}</Link>}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </sky-card>
      </section>

      <details className="member-disclosure">
        <summary>Activity History</summary>
        {activityError && <p className="error-state" role="alert">{activityError}</p>}
        {activityLoading ? (
          <p className="loading-state">Loading activity…</p>
        ) : activity.length === 0 ? (
          <p className="empty-state">No activity recorded yet.</p>
        ) : (
          activity.map((entry) => (
            <p key={entry.id} className="field-hint">
              {humanizeAction(entry.action)} — {new Date(entry.createdAt).toLocaleString()}
            </p>
          ))
        )}
      </details>

      <section aria-labelledby="order-payment-attempts-title">
        <h2 id="order-payment-attempts-title" className="section-title">Payment Attempts &amp; Refunds</h2>
        <details>
          <summary>{order.payments.length} payment attempt{order.payments.length === 1 ? '' : 's'}{refunds.length > 0 ? `, ${refunds.length} refund${refunds.length === 1 ? '' : 's'}` : ''}</summary>
          {order.payments.length === 0 && refunds.length === 0 ? (
            <p className="empty-state">No payment attempts or refunds recorded.</p>
          ) : (
            <>
              {order.payments.map((p) => (
                <p key={p.id} className="field-hint">
                  {p.provider} · {p.status} · {formatINR(Number(p.amount))} · {new Date(p.createdAt).toLocaleString()}
                  {p.failureReason ? ` · ${p.failureReason}` : ''}
                </p>
              ))}
              {refunds.map((r) => (
                <p key={r.id} className="field-hint">
                  Refund · {formatINR(Number(r.amount))} · {r.type} · {r.status}{r.reason ? ` · ${r.reason}` : ''}
                </p>
              ))}
            </>
          )}
        </details>
      </section>

      <section aria-labelledby="order-technical-title">
        <h2 id="order-technical-title" className="section-title">Technical Reference</h2>
        <details>
          <summary>Raw identifiers</summary>
          <p className="field-hint">Order ID: {order.id}</p>
          {order.items.map((item) => (
            <div key={item.id}>
              <p className="field-hint">Item ID: {item.id}</p>
              {item.purchaseEntitlements.map((ent) => (
                <p key={ent.id} className="field-hint">
                  Voucher {ent.voucherCode} ? {ent.settlementStatus.replace(/_/g, ' ')}
                  {ent.carrier ? ` ? Carrier: ${ent.carrier}` : ''}
                  {ent.trackingNumber ? ` ? Tracking: ${ent.trackingNumber}` : ''}
                  {ent.deliveryEvidenceNote ? ` ? ${ent.deliveryEvidenceNote}` : ''}
                </p>
              ))}
            </div>
          ))}
        </details>
      </section>
    </div>
  );
}

export default OrderDetailPage;
