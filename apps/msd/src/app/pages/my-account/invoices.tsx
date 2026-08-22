import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listMyOrders, type Order } from '../../../api/orders';
import { ApiRequestError } from '../../../api/rbac/client';
import { formatINR } from '../../../utils/format';
import '../category/category.css';

/** Invoices — every order the customer has placed, each linking to its real, printable invoice
 *  at `/orders/:id/invoice` (see `pages/invoice/invoice.tsx`). Same "zero new backend work,
 *  fetch the customer's own orders" pattern as the sibling Payment History page. */
export function MyAccountInvoices() {
  const { token } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    listMyOrders(token, { pageSize: 100 })
      .then(({ data }) => setOrders(data))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load your invoices.'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="category-page">
      <title>Invoices | MSD</title>
      <meta name="robots" content="noindex" />

      <header className="category-page__hero">
        <div className="category-page__hero-inner">
          <div>
            <h1 className="category-page__title">Invoices</h1>
            <p className="category-page__subtitle">Every order you've placed, most recent first.</p>
          </div>
        </div>
      </header>

      <section className="category-page__grid-wrap">
        <div className="category-page__grid-inner">
          {loading ? (
            <p className="loading-state">Loading invoices…</p>
          ) : error ? (
            <p className="error-state" role="alert">{error}</p>
          ) : orders.length === 0 ? (
            <div className="category-page__empty">
              <sky-info-card icon="receipt_long" heading="No invoices yet" subheading="Orders you place will show up here." />
            </div>
          ) : (
            <ul className="entity-list">
              {orders.map((order) => (
                <li key={order.id}>
                  <div className="entity-list__item">
                    <span className="role-list__name">
                      {order.vendorNameSnapshot}
                      <span className="field-hint">
                        {' '}
                        · {formatINR(Number(order.total))} · {new Date(order.createdAt).toLocaleDateString()}
                      </span>
                    </span>
                    <span className="status-pill status-pill--active">{order.status}</span>
                  </div>
                  <Link to={`/orders/${order.id}/invoice`} className="field-hint">View invoice →</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

export default MyAccountInvoices;
