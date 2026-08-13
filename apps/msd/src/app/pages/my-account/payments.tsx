import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listMyOrders, type Order, type PaymentSummary, type PaymentStatus } from '../../../api/orders';
import { ApiRequestError } from '../../../api/rbac/client';
import { formatINR } from '../../../utils/format';
import '../category/category.css';

/** One payment, flattened out of its parent order with just enough order context to link back. */
interface PaymentRow extends PaymentSummary {
  orderId: string;
  orderVendorName: string;
}

const STATUS_CLASS: Record<PaymentStatus, string> = {
  PAID: 'status-pill--active',
  CREATED: 'status-pill--inactive',
  FAILED: 'status-pill--blocked',
  CANCELLED: 'status-pill--blocked',
};

function flattenPayments(orders: Order[]): PaymentRow[] {
  return orders
    .flatMap((order) =>
      order.payments.map((payment) => ({
        ...payment,
        orderId: order.id,
        orderVendorName: order.vendorNameSnapshot,
      })),
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Payment History — needs zero new backend work: `GET /orders/me` already returns each order's
 * `payments[]` (see `api/orders.ts`'s `Order.payments`), so this just fetches the customer's own
 * orders and flattens every payment across them into one chronological list, client-side. No
 * pagination — order/payment counts for a single customer are small.
 */
export function MyAccountPayments() {
  const { token } = useAuth();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    listMyOrders(token, { pageSize: 100 })
      .then(({ data }) => setPayments(flattenPayments(data)))
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
              {payments.map((payment) => (
                <li key={payment.id}>
                  <div className="entity-list__item">
                    <span className="role-list__name">
                      {formatINR(Number(payment.amount))}
                      <span className="field-hint">
                        {' '}
                        · {payment.provider} · {payment.orderVendorName}
                        {' '}
                        · {new Date(payment.createdAt).toLocaleDateString()}
                      </span>
                    </span>
                    <span className={`status-pill ${STATUS_CLASS[payment.status]}`}>{payment.status}</span>
                  </div>
                  {payment.status === 'FAILED' && payment.failureReason && (
                    <p className="error-state">{payment.failureReason}</p>
                  )}
                  <Link to={`/orders/${payment.orderId}`} className="field-hint">View order →</Link>
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
