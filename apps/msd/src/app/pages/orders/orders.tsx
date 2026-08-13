import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FilledButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listMyOrders, type Order } from '../../../api/orders';
import { ApiRequestError } from '../../../api/rbac/client';
import '../category/category.css';

/** Customer's own orders — the Cart/Booking convergence point. Reuses `entity-list`/
 *  `status-pill` exactly like `bookings.tsx`. Relocated here from the old marketplace orders
 *  route now that the marketplace route namespace is retired — this page never had a
 *  mock/static equivalent, so it moved rather than merged. */
export function Orders() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    listMyOrders(token, { pageSize: 50 })
      .then(({ data }) => setOrders(data))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load your orders.'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="category-page">
      <title>My Orders | MSD</title>
      <meta name="robots" content="noindex" />

      <header className="category-page__hero">
        <div className="category-page__hero-inner">
          <div>
            <h1 className="category-page__title">My Orders</h1>
            <p className="category-page__subtitle">Your product and service orders.</p>
          </div>
        </div>
      </header>

      <section className="category-page__grid-wrap">
        <div className="category-page__grid-inner">
          {loading ? (
            <p className="loading-state">Loading orders…</p>
          ) : error ? (
            <p className="error-state" role="alert">{error}</p>
          ) : orders.length === 0 ? (
            <div className="category-page__empty">
              <sky-info-card icon="receipt_long" heading="No orders yet" subheading="Orders you place will show up here." />
              <FilledButton onClick={() => navigate('/categories')}>Browse Categories</FilledButton>
            </div>
          ) : (
            <ul className="entity-list">
              {orders.map((order) => (
                <li key={order.id}>
                  <div className="entity-list__item">
                    <span className="role-list__name">
                      {order.items.map((i) => i.itemName).join(', ')}
                      <span className="field-hint">
                        {' '}
                        · {order.type} · {order.vendorNameSnapshot} · {order.branchNameSnapshot} · ₹{order.total}
                        {' '}
                        · {new Date(order.createdAt).toLocaleDateString()}
                      </span>
                    </span>
                    <span className={`status-pill ${order.status === 'CANCELLED' ? 'status-pill--inactive' : 'status-pill--active'}`}>
                      {order.status}
                    </span>
                  </div>
                  <Link to={`/orders/${order.id}`} className="field-hint">View details →</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

export default Orders;
