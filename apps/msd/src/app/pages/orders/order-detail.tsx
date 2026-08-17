import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FilledButton, OutlinedButton, Divider } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getMyOrder, cancelMyOrder, type Order } from '../../../api/orders';
import { ApiRequestError } from '../../../api/rbac/client';
import { formatINR } from '../../../utils/format';
import content from '../../../content.json';
import '../cart/cart.css';

/** Order confirmation / detail — the landing page after checkout or "confirm booking",
 *  reusing `cart.css`'s summary-card classes for a consistent look. Relocated here from
 *  the old marketplace order-detail route now that the marketplace route namespace is retired. */
export function OrderDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { orderDetail } = content;
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getMyOrder(token, id)
      .then(({ data }) => setOrder(data))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : orderDetail.errors.load))
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
        <title>{orderDetail.notFound.metaTitle}</title>
        <sky-info-card icon="search_off" heading={orderDetail.notFound.heading} subheading={error || orderDetail.notFound.subheading} />
        <FilledButton onClick={() => navigate('/orders')}>{orderDetail.notFound.cta}</FilledButton>
      </div>
    );
  }

  return (
    <div className="cart-page">
      <title>{orderDetail.metaTitle}</title>
      <meta name="robots" content="noindex" />

      <div className="cart-page__inner">
        <h1 className="cart-page__title"> {orderDetail.title.prefix}{' '} {order.status === 'PENDING_PAYMENT' ? orderDetail.title.placed : order.status.toLowerCase()}</h1>

        {error && <p className="error-state" role="alert">{error}</p>}

        <sky-card variant="outlined" className="cart-summary-card">
          <div className="cart-summary">
            <div className="cart-summary__row">
              <span>{orderDetail.labels.vendor}</span>
              <span>{order.vendorNameSnapshot}</span>
            </div>
            <div className="cart-summary__row">
              <span>{orderDetail.labels.branch}</span>
              <span>{order.branchNameSnapshot}</span>
            </div>
            {order.booking && (
              <div className="cart-summary__row">
                <span>{orderDetail.labels.appointment}</span>
                <span>{new Date(order.booking.bookingDate).toLocaleDateString()}{' '}{orderDetail.labels.timeConnector}{' '}{order.booking.timeSlot}</span></div>
            )}
            <Divider />
            {order.items.map((item) => (
              <div className="cart-summary__row" key={item.id}>
                <span>
                  {item.itemName} × {item.quantity}
                  {item.durationMinutes && ` (${item.durationMinutes} ${orderDetail.labels.durationSuffix})`}
                </span>
                <span>{formatINR(Number(item.lineTotal))}</span>
              </div>
            ))}
            <Divider />
            <div className="cart-summary__row cart-summary__row--total">
              <strong>{orderDetail.labels.total}</strong>
              <strong>{formatINR(Number(order.total))}</strong>
            </div>
            {order.cancellationReason && <p className="error-state"> {orderDetail.labels.cancelled} {order.cancellationReason}</p>}
            {order.status === 'PENDING_PAYMENT' && order.payments[0]?.status === 'FAILED' && (
              <p className="error-state"> {orderDetail.labels.paymentFailed}{' '} {order.payments[0].failureReason ?? orderDetail.labels.retryPayment}</p>
            )}
            {order.status === 'PENDING_PAYMENT' && (
              <FilledButton onClick={() => navigate('/checkout', { state: { orderId: order.id } })}>
                 {orderDetail.actions.payPrefix} {formatINR(Number(order.total))}
              </FilledButton>
            )}
            {(order.status === 'PENDING_PAYMENT' || order.status === 'CONFIRMED') && (
              <OutlinedButton onClick={cancel}>{orderDetail.actions.cancelOrder}</OutlinedButton>
            )}
            <OutlinedButton onClick={() => navigate(`/orders/${order.id}/invoice`)}> {orderDetail.actions.downloadInvoice}</OutlinedButton>
            <OutlinedButton onClick={() => navigate('/orders')}> {orderDetail.actions.myOrders}</OutlinedButton>
            <OutlinedButton onClick={() => navigate('/categories')}> {orderDetail.actions.continueShopping}</OutlinedButton>
          </div>
        </sky-card>
      </div>
    </div>
  );
}

export default OrderDetail;
