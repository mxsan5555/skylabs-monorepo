import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { useNavigate, useParams } from 'react-router-dom';
import { FilledButton, CircularProgress, OutlinedButton, Divider, Icon, Dialog, OutlinedTextField, TextButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getMyOrder, cancelMyOrder, type Order, type OrderItem } from '../../../api/orders';
import { raiseDispute } from '../../../api/rbac/disputes';
import { ApiRequestError } from '../../../api/rbac/client';
import { formatINR } from '../../../utils/format';
import content from '../../../content.json';
import { groupOrderItemsByVendor } from '../../../utils/order-items';
import { showSnackbar } from '../../../snackbar/snackbar';
import '../cart/cart.css';
import { Breadcrumb } from '../../components/breadcrumb';
import { ProductOrderTimeline } from '../orders/product-order-timeline';
import { OrderCancellationTimeline } from './order-cancellation-timeline';

const ENTITLEMENT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Not started yet',
  STARTED: 'In progress',
  OTP_REQUESTED: 'Completion in progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

/**
 * Per-entitlement voucher display + "Raise Issue" — renders nothing when `item.entitlements` is
 * absent (see `api/orders.ts`'s own doc comment on that field: the backend doesn't populate it
 * yet, so this degrades to a no-op rather than showing broken/empty UI). No QR code — none
 * exists in `shared-ui` (confirmed, zero hits) — just the opaque voucher code and its status.
 */
function PurchaseVerification({ item, onRaiseIssue }: { item: OrderItem; onRaiseIssue: (entitlementId: string) => void }) {
  const { verification } = content.orderDetail;
  if (!item.entitlements || item.entitlements.length === 0) return null;
  return (
    <div className="cart-vendor-group__entitlements">
      <p className="field-hint">
        <strong>{verification.heading}</strong>
      </p>
      {item.entitlements.map((e) => (
        <p key={e.id} className="field-hint">
          {verification.voucherLabel}: <code>{e.voucherCode}</code> · {verification.statusLabel}:{' '}
          {ENTITLEMENT_STATUS_LABEL[e.entitlementStatus] ?? e.entitlementStatus}
          {e.dispute ? (
            <> · {verification.disputeStatus[e.dispute.status as keyof typeof verification.disputeStatus] ?? e.dispute.status}</>
          ) : (
            <>
              {' '}
              <TextButton onClick={() => onRaiseIssue(e.id)}>{verification.raiseIssue.cta}</TextButton>
            </>
          )}
        </p>
      ))}
    </div>
  );
}

export function OrderDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { orderDetail } = content;

  const raiseIssueDialogRef = useRef<MdDialog>(null);
  const [raiseIssueEntitlementId, setRaiseIssueEntitlementId] = useState('');
  const [raiseIssueReason, setRaiseIssueReason] = useState('');
  const [raiseIssueDescription, setRaiseIssueDescription] = useState('');
  const [raiseIssueError, setRaiseIssueError] = useState('');
  const [raiseIssueSaving, setRaiseIssueSaving] = useState(false);

  const openRaiseIssue = (entitlementId: string) => {
    setRaiseIssueEntitlementId(entitlementId);
    setRaiseIssueReason('');
    setRaiseIssueDescription('');
    setRaiseIssueError('');
    raiseIssueDialogRef.current?.show();
  };

  const submitRaiseIssue = async () => {
    if (!raiseIssueReason.trim()) return;
    setRaiseIssueSaving(true);
    setRaiseIssueError('');
    try {
      await raiseDispute(token, {
        entitlementId: raiseIssueEntitlementId,
        reason: raiseIssueReason.trim(),
        description: raiseIssueDescription.trim() || undefined,
      });
      raiseIssueDialogRef.current?.close();
      showSnackbar(orderDetail.verification.raiseIssue.success);
      load();
    } catch (err) {
      setRaiseIssueError(err instanceof ApiRequestError ? err.message : orderDetail.verification.raiseIssue.error);
    } finally {
      setRaiseIssueSaving(false);
    }
  };

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
                            <div className="cart-item__timeline"> <ProductOrderTimeline status={order.status}   paymentStatus={order.payments[0]?.status}/></div>
                          )}
                        {isCancelled && (
                          <div className="cart-item__timeline"> <OrderCancellationTimeline order={order} /></div>
                        )}
                        <PurchaseVerification item={item} onRaiseIssue={openRaiseIssue} />
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

      <Dialog ref={raiseIssueDialogRef as RefObject<MdDialog>}>
        <div slot="headline">{orderDetail.verification.raiseIssue.dialogTitle}</div>
        <div slot="content" className="form-grid">
          <OutlinedTextField
            label={orderDetail.verification.raiseIssue.reasonLabel}
            value={raiseIssueReason}
            onInput={(e: Event) => setRaiseIssueReason((e.target as HTMLInputElement).value)}
          />
          <OutlinedTextField
            label={orderDetail.verification.raiseIssue.descriptionLabel}
            type="textarea"
            rows={3}
            value={raiseIssueDescription}
            onInput={(e: Event) => setRaiseIssueDescription((e.target as HTMLTextAreaElement).value)}
          />
          {raiseIssueError && <p className="error-state" role="alert">{raiseIssueError}</p>}
        </div>
        <div slot="actions">
          <TextButton onClick={() => raiseIssueDialogRef.current?.close()}>{orderDetail.verification.raiseIssue.cancel}</TextButton>
          <FilledButton onClick={submitRaiseIssue} disabled={raiseIssueSaving || !raiseIssueReason.trim()}>
            {raiseIssueSaving ? '…' : orderDetail.verification.raiseIssue.submit}
          </FilledButton>
        </div>
      </Dialog>
    </div>
  );
}
export default OrderDetail;
