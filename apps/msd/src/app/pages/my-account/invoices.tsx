import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listMyOrders, type Order } from '../../../api/orders';
import { ApiRequestError } from '../../../api/rbac/client';
import { formatINR } from '../../../utils/format';
import { SectionHead } from '../../components/section-head/section-head';
import content from '../../../content.json';

const t = content.invoices;

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
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : t.errors.load))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <title>{t.metaTitle}</title>
      <meta name="robots" content="noindex" />
      <SectionHead as="h1" id="invoices-heading" heading={t.title} subheading={t.subtitle} />
      {loading ? (
        <p className="loading-state" role="status">{t.loading}</p>
      ) : error ? (
        <p className="error-state" role="alert">{error}</p>
      ) : orders.length === 0 ? (
        <div className="empty-state">
          <sky-info-card icon="receipt_long" heading={t.empty.title} subheading={t.empty.description} />
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
              <Link to={`/orders/${order.id}/invoice`} className="field-hint">{t.viewInvoice}</Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default MyAccountInvoices;
