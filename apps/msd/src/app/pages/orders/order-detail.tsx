import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FilledButton, CircularProgress, OutlinedButton, Divider, Icon, } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getMyOrder, cancelMyOrder, type Order, } from '../../../api/orders';
import { ApiRequestError } from '../../../api/rbac/client';
import { formatINR } from '../../../utils/format';
import content from '../../../content.json';
import { groupOrderItemsByVendor } from '../../../utils/order-items';
import '../cart/cart.css';
import { Breadcrumb } from '../../components/breadcrumb';
import { ProductOrderTimeline } from '../orders/product-order-timeline';
import { OrderCancellationTimeline } from './order-cancellation-timeline';

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
      .catch((err) =>
        setError(err instanceof ApiRequestError ? err.message : orderDetail.errors.load,),
      )
      .finally(() => setLoading(false));
  }, [token, id, orderDetail.errors.load]);
  useEffect(() => { load(); }, [load]);
  const cancel = async () => {
    if (!order || !window.confirm(orderDetail.cancelDialog.message)) {
      return;
    }
    setError('');
    try {
      const { data } = await cancelMyOrder(token, order.id);
      setOrder(data);
    } catch (err) { setError(err instanceof ApiRequestError ? err.message : orderDetail.errors.cancel,); }
  };
  const vendorGroups = order ? groupOrderItemsByVendor(order.items) : [];
  if (loading) {
    return (
      <div className="order-loading">
        <CircularProgress indeterminate aria-label="Loading order" />
        <p>{orderDetail.loading}</p>
      </div>
    );
  }
  if (error || !order) {
    return (
      <div className="cart-page cart-page--empty">
        <title>{orderDetail.notFound.metaTitle}</title>
        <sky-info-card icon="search_off" heading={orderDetail.notFound.heading}
          subheading={error || orderDetail.notFound.subheading} />
        <FilledButton onClick={() => navigate('/orders')}>{orderDetail.notFound.cta}</FilledButton>
      </div>
    );
  }
  const isCancelled = order.status === 'CANCELLED';
  const isPaid = order.payments[0]?.status === 'PAID';
  return (
    <div className="cart-page">
      <title>{orderDetail.metaTitle}</title>
      <meta name="robots" content="noindex" />
      <div className="cart-page__inner">
        <Breadcrumb
          items={[
            { label: 'Home', to: '/' },
            { label: 'My Orders', to: '/orders' },
            { label: `Order #${order.id}` },
          ]}
        />
        {error && (<p className="error-state" role="alert">{error}</p>)}
        <div className="cart-page__layout">
          <section className="cart-page__items">
            {vendorGroups.map((group) => (
              <div key={group.vendorId} className="cart-vendor-group">
                <p className="cart-vendor-group__heading">
                  <Icon aria-hidden="true">storefront</Icon>
                  <strong>{group.vendorName}</strong>
                  {group.branchName && ` · ${group.branchName}`}
                </p>
                <ul className="cart-list">
                  {group.items.map((item) => (
                    <li key={item.id} className="cart-item">
                      {item.image && (
                        <img
                          className="cart-item__img"
                          src={item.image}
                          alt={item.itemName}
                          width={100}
                          height={100}
                          loading="lazy"
                        />
                      )}
                      <div className="cart-item__body">
                        <div className="cart-item__top">
                          <div>
                            <p className="cart-item__provider">{item.itemType === 'SERVICE' ? 'Service' : 'Product'}</p>
                            <h3 className="cart-item__title">{item.itemName}</h3>
                            <p className="cart-item__provider">
                              {item.quantity} ×{' '} {item.durationMinutes ? `${item.durationMinutes} min` : 'Item'}
                            </p>
                          </div>
                          <p className="cart-item__price"> {formatINR(Number(item.lineTotal),)}</p>
                        </div>
                        {item.itemType === 'PRODUCT' &&
                          !isCancelled && (
                            <div className="cart-item__timeline"> <ProductOrderTimeline status={order.status} /></div>
                          )}
                        {isCancelled && (
                          <div className="cart-item__timeline"> <OrderCancellationTimeline order={order} /></div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {isCancelled && isPaid && (
                  <sky-info-card
                    icon="info"
                    heading="Refund Information"
                    subheading={orderDetail.messages.refundAfterCancellation}
                  />
                )}
              </div>
            ))}
          </section>
          <aside className="cart-page__summary" aria-label="Order summary">
            <sky-card variant="outlined" className="cart-summary-card">
              <div className="cart-summary">
                <h2 className="cart-summary__heading">Order Summary</h2>
                <div className="cart-summary__row">
                  <span>Payment</span>
                  <span>{order.payments[0]?.status ?? 'Not available'}</span>
                </div>
                {order.payments[0]?.provider && (
                  <div className="cart-summary__row">
                    <span>Paid via</span>
                    <span>{order.payments[0].provider === 'RAZORPAY' ? 'Razorpay' : order.payments[0].provider}</span>
                  </div>
                )}
                {order.branchNameSnapshot && (
                  <div className="cart-summary__row">
                    <span>Branch</span>
                    <span>{order.branchNameSnapshot}</span>
                  </div>
                )}
                <div className="cart-summary__row">
                  <span>Order Placed</span>
                  <span>
                    {new Date(order.createdAt,).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                {order.type === 'PRODUCT' &&
                  order.shippingAddress && (
                    <sky-accordion className="cart-summary__delivery">
                      <sky-accordion-item header="Delivery Address">
                        <div className="cart-summary__address">
                          <div className="cart-summary__address-line">
                            <Icon aria-hidden="true">location_on</Icon>
                            <span>{order.shippingAddress}</span>
                          </div>
                          <div className="cart-summary__address-location">
                            {order.shippingCity},{' '}
                            {order.shippingState} -{' '}
                            {order.shippingPincode}
                          </div>
                        </div>
                      </sky-accordion-item>
                    </sky-accordion>
                  )}
                <Divider />
                <div className="cart-summary__row cart-summary__row--total">
                  <strong>{orderDetail.labels.total}</strong>
                  <strong>{formatINR(Number(order.total))}</strong>
                </div>
                <div className="cart-summary__actions">
                  {order.status === 'PENDING_PAYMENT' && (
                    <FilledButton
                      onClick={() => navigate('/checkout', { state: { orderId: order.id, }, })}>
                      {orderDetail.actions.payPrefix}{' '}{formatINR(Number(order.total))}
                      <Icon slot="trailing-icon" aria-hidden="true">arrow_forward</Icon>
                    </FilledButton>
                  )}
                  <FilledButton onClick={() => navigate(`/orders/${order.id}/invoice`,)}>
                    {orderDetail.actions.downloadInvoice}
                  </FilledButton>
                  <OutlinedButton onClick={() => navigate('/orders')}>{orderDetail.actions.myOrders}</OutlinedButton>
                  {(order.status === 'PENDING_PAYMENT' ||
                    order.status === 'CONFIRMED') && (
                      <OutlinedButton onClick={cancel}>{orderDetail.actions.cancelOrder}</OutlinedButton>
                    )}
                </div>
              </div>
            </sky-card>
          </aside>
        </div>
        {order.status === 'PENDING_PAYMENT' &&
          order.payments[0]?.status === 'FAILED' && (
            <sky-info-card
              icon="error"
              heading={orderDetail.labels.paymentFailed}
              subheading={order.payments[0].failureReason ?? orderDetail.labels.retryPayment}
            />
          )}
      </div>
    </div>
  );
}
export default OrderDetail;