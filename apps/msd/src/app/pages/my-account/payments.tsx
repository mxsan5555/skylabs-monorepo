import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listMyOrders, type Order, type PaymentSummary, type PaymentStatus } from '../../../api/orders';
import { ApiRequestError } from '../../../api/rbac/client';
import { formatINR } from '../../../utils/format';
import '../category/category.css';

/** One logical purchase (Order), carrying whichever Payment attempt actually represents its
 *  outcome — never one row per raw Payment record. See `groupPaymentsByOrder`'s own doc comment
 *  for why: an Order can legitimately accumulate more than one Payment attempt (a retry, or a
 *  stray attempt on another payment method), and showing each as its own top-level row is exactly
 *  what made one purchase look like two in Payment History. */
interface OrderPaymentRow {
  orderId: string;
  orderVendorName: string;
  itemNames: string[];
  createdAt: string;
  primaryPayment: PaymentSummary;
  /** Any other payment attempts on this same order beyond the primary one — shown as a small
   *  secondary detail, never as their own top-level row. Normally empty; non-empty only for a
   *  genuine retry (e.g. a failed attempt before the successful one). */
  otherAttempts: PaymentSummary[];
}

const STATUS_CLASS: Record<PaymentStatus, string> = {
  PAID: 'status-pill--active',
  CREATED: 'status-pill--inactive',
  FAILED: 'status-pill--blocked',
  CANCELLED: 'status-pill--blocked',
};

/**
 * One row per Order, not one row per Payment. An Order's `payments[]` can legitimately hold more
 * than one attempt (a failed-then-retried Razorpay payment, or — before the backend guard added
 * alongside this fix — a stray attempt on a second payment method); this picks the order's PAID
 * payment as the one that actually represents it (falling back to the most recent attempt if
 * none succeeded yet), and folds every other attempt into `otherAttempts` instead of surfacing
 * each as its own top-level "purchase". Needs no new backend endpoint — `GET /orders/me` already
 * returns each order's `payments[]` (see `api/orders.ts`'s `Order.payments`).
 */
function groupPaymentsByOrder(orders: Order[]): OrderPaymentRow[] {
  return orders
    .filter((order) => order.payments.length > 0)
    .map((order) => {
      const byRecency = [...order.payments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const primaryPayment = byRecency.find((p) => p.status === 'PAID') ?? byRecency[0];
      return {
        orderId: order.id,
        orderVendorName: order.vendorNameSnapshot,
        itemNames: order.items.map((item) => item.itemName),
        createdAt: order.createdAt,
        primaryPayment,
        otherAttempts: byRecency.filter((p) => p.id !== primaryPayment.id),
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Payment History — needs zero new backend work: `GET /orders/me` already returns each order's
 * `payments[]` (see `api/orders.ts`'s `Order.payments`), so this just fetches the customer's own
 * orders and groups each order's payment attempts into one logical-purchase row, client-side. No
 * pagination — order/payment counts for a single customer are small.
 */
export function MyAccountPayments() {
  const { token } = useAuth();
  const [payments, setPayments] = useState<OrderPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    listMyOrders(token, { pageSize: 100 })
      .then(({ data }) => setPayments(groupPaymentsByOrder(data)))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load your payment history.'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="category-page">
      <title>Payment History | MSD</title>
      <meta name="robots" content="noindex" />

      <header className="category-page__hero">
        <div className="category-page__hero-inner">
          <div>
            <h1 className="category-page__title">Payment History</h1>
            <p className="category-page__subtitle">Every payment across your orders, most recent first.</p>
          </div>
        </div>
      </header>

      <section className="category-page__grid-wrap">
        <div className="category-page__grid-inner">
          {loading ? (
            <p className="loading-state">Loading payment history…</p>
          ) : error ? (
            <p className="error-state" role="alert">{error}</p>
          ) : payments.length === 0 ? (
            <div className="category-page__empty">
              <sky-info-card icon="payments" heading="No payments yet" subheading="Payments you make will show up here." />
            </div>
          ) : (
            <ul className="entity-list">
              {payments.map((row) => (
                <li key={row.orderId}>
                  <div className="entity-list__item">
                    <span className="role-list__name">
                      {row.itemNames.join(', ')}
                      <span className="field-hint">
                        {' '}
                        · {formatINR(Number(row.primaryPayment.amount))} · {row.primaryPayment.provider} · {row.orderVendorName}
                        {' '}
                        · {new Date(row.createdAt).toLocaleDateString()}
                      </span>
                    </span>
                    <span className={`status-pill ${STATUS_CLASS[row.primaryPayment.status]}`}>{row.primaryPayment.status}</span>
                  </div>
                  {row.primaryPayment.status === 'FAILED' && row.primaryPayment.failureReason && (
                    <p className="error-state">{row.primaryPayment.failureReason}</p>
                  )}
                  {row.otherAttempts.length > 0 && (
                    <p className="field-hint">
                      Other payment attempts on this order: {row.otherAttempts.map((a) => `${a.provider} (${a.status})`).join(', ')}
                    </p>
                  )}
                  <Link to={`/orders/${row.orderId}`} className="field-hint">View order →</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

export default MyAccountPayments;
