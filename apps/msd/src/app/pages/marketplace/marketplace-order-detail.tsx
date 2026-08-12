import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FilledButton, OutlinedButton, Divider } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getMyOrder, cancelMyOrder, type Order } from '../../../api/orders';
import { ApiRequestError } from '../../../api/rbac/client';
import { formatINR } from '../../../utils/format';
import '../cart/cart.css';

/** Order confirmation / detail — the landing page after checkout or "confirm booking",
 *  reusing `cart.css`'s summary-card classes for a consistent look. */
export function MarketplaceOrderDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getMyOrder(token, id)
      .then(({ data }) => setOrder(data))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load this order.'))
      .finally(() => setLoading(false));
  }, [token, id]);

  useEffect(() => {
    load();
  }, [load]);

  const cancel = async () => {
    if (!order || !window.confirm('Cancel this order?')) return;
    setError('');
    try {
      const { data } = await cancelMyOrder(token, order.id);
      setOrder(data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not cancel this order.');
    }
  };

  if (loading) return <p className="loading-state">Loading order…</p>;

  if (error || !order) {
    return (
      <div className="cart-page cart-page--empty">
        <title>Order Not Found | MSD</title>
        <sky-info-card icon="search_off" heading="Order not found" subheading={error || 'It may belong to a different account.'} />
        <FilledButton onClick={() => navigate('/marketplace/orders')}>My Orders</FilledButton>
      </div>
    );
  }

  return (
    <div className="cart-page">
      <title>Order Confirmed | MSD</title>
      <meta name="robots" content="noindex" />

      <div className="cart-page__inner">
        <h1 className="cart-page__title">Order {order.status === 'PENDING_PAYMENT' ? 'placed' : order.status.toLowerCase()}</h1>

        {error && <p className="error-state" role="alert">{error}</p>}

        <sky-card variant="outlined" className="cart-summary-card">
          <div className="cart-summary">
            <div className="cart-summary__row">
              <span>Vendor</span>
              <span>{order.vendorNameSnapshot}</span>
            </div>
            <div className="cart-summary__row">
              <span>Branch</span>
              <span>{order.branchNameSnapshot}</span>
            </div>
            {order.booking && (
              <div className="cart-summary__row">
                <span>Appointment</span>
                <span>{new Date(order.booking.bookingDate).toLocaleDateString()} at {order.booking.timeSlot}</span>
              </div>
            )}
            <Divider />
            {order.items.map((item) => (
              <div className="cart-summary__row" key={item.id}>
                <span>
                  {item.itemName} × {item.quantity}
                  {item.durationMinutes && ` (${item.durationMinutes} min)`}
                </span>
                <span>{formatINR(Number(item.lineTotal))}</span>
              </div>
            ))}
            <Divider />
            <div className="cart-summary__row cart-summary__row--total">
              <strong>Total</strong>
              <strong>{formatINR(Number(order.total))}</strong>
            </div>
            {order.cancellationReason && <p className="error-state">Cancelled: {order.cancellationReason}</p>}
            {order.status === 'PENDING_PAYMENT' && order.payments[0]?.status === 'FAILED' && (
              <p className="error-state">Payment failed: {order.payments[0].failureReason ?? 'Please try again.'}</p>
            )}
            {order.status === 'PENDING_PAYMENT' && (
              <FilledButton onClick={() => navigate('/checkout', { state: { orderId: order.id } })}>
                Pay {formatINR(Number(order.total))}
              </FilledButton>
            )}
            {(order.status === 'PENDING_PAYMENT' || order.status === 'CONFIRMED') && (
              <OutlinedButton onClick={cancel}>Cancel order</OutlinedButton>
            )}
            <OutlinedButton onClick={() => navigate('/marketplace/orders')}>My Orders</OutlinedButton>
          </div>
        </sky-card>
      </div>
    </div>
  );
}

export default MarketplaceOrderDetail;
