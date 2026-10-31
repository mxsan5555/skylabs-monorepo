import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { useNavigate, useParams } from 'react-router-dom';
import { FilledButton, Icon, OutlinedButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { cancelMyOrder, getMyOrder, type Order } from '../../../api/orders';
import { ApiRequestError } from '../../../api/rbac/client';
import { fillTemplate, formatINR, formatLongDate, formatStreetAddress, orderNumber } from '../../../utils/format';
import { lineFromOrderItem } from '../../../utils/cart-items';
import { PageSection } from '../../components/page-section/page-section';
import { SplitLayout } from '../../components/split-layout/split-layout';
import { SectionHead } from '../../components/section-head/section-head';
import { Breadcrumb } from '../../components/breadcrumb';
import { StepIndicator } from '../../components/step-indicator/step-indicator';
import { StatusPanel } from '../../components/status-panel/status-panel';
import { SummaryPanel } from '../../components/summary-panel/summary-panel';
import { PurchaseLineCard, PurchaseLineList } from '../../components/purchase-line-card/purchase-line-card';
import { useConfirmDialog } from '../../components/confirm-dialog';
import { ORDER_STATUS_TONE } from './customer-order-card';
import { Seo } from '../../seo/seo';
import content from '../../../content.json';

const t = content.orderDetail;
const TITLE_ID = 'order-detail-title';
const ITEMS_ID = 'order-detail-items';
const DELIVERY_ID = 'order-detail-delivery';
const SUMMARY_ID = 'order-detail-summary';

/** The steps of one order and the index of the current one (past the end = all done). */
function progressOf(order: Order): { steps: string[]; current: number } {
  if (order.status === 'CANCELLED') return { steps: [t.steps.placed, t.steps.cancelled], current: 1 };
  const finished = order.items.some((item) => item.itemType === 'PRODUCT') ? t.steps.delivered : t.steps.completed;
  const current = order.status === 'PENDING_PAYMENT' ? 0 : order.status === 'CONFIRMED' ? 1 : 3;
  return { steps: [t.steps.placed, t.steps.confirmed, finished], current };
}

/**
 * `/orders/:id`: one order. h1 with the short number, date and status; one progress list for the
 * whole order; notices for a failed payment or a refund; every line as a card with its own image,
 * member, branch and new-tab detail link; the delivery address; and an order summary beside it
 * (payment, method, date, total, Pay / Download invoice / Cancel). Cancel asks in the app dialog.
 */
export function OrderDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getMyOrder(token, id)
      .then(({ data }) => setOrder(data))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : t.errors.load))
      .finally(() => setLoading(false));
  }, [token, id]);
  useEffect(() => {
    load();
  }, [load]);

  const cancel = async () => {
    if (!order) return;
    const ok = await confirm({
      title: t.cancelDialog.title,
      message: t.cancelDialog.message,
      confirmLabel: t.cancelDialog.confirm,
      cancelLabel: t.cancelDialog.cancel,
    });
    if (!ok) return;
    setError('');
    try {
      setOrder((await cancelMyOrder(token, order.id)).data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t.errors.cancel);
    }
  };

  const seo = <Seo title={t.metaTitle} description={t.metaDescription} path={`/orders/${id}`} noindex />;
  if (loading) {
    return (
      <PageSection>
        {seo}
        <p className="loading-state" role="status">
          {t.loading}
        </p>
      </PageSection>
    );
  }
  if (!order) {
    return (
      <PageSection aria-labelledby={TITLE_ID}>
        {seo}
        <SplitLayout asideLabel={t.summaryHeading}>
          <StatusPanel
            id={TITLE_ID}
            icon="search_off"
            tone="neutral"
            heading={t.notFound.heading}
            text={error || t.notFound.subheading}
            actions={<FilledButton onClick={() => navigate('/orders')}>{t.notFound.cta}</FilledButton>}
          />
        </SplitLayout>
      </PageSection>
    );
  }

  const number = orderNumber(order.id);
  const payment = order.payments[0];
  const progress = progressOf(order);
  const total = formatINR(Number(order.total));
  const canCancel = order.status === 'PENDING_PAYMENT' || order.status === 'CONFIRMED';
  const hasProducts = order.items.some((item) => item.itemType === 'PRODUCT');
  const payNow = () => navigate('/checkout', { state: { orderId: order.id } });

  return (
    <PageSection aria-labelledby={TITLE_ID}>
      {seo}
      {ConfirmDialog}
      <Breadcrumb items={[{ label: content.myAccount.home, to: '/' }, { label: t.breadcrumbOrders, to: '/orders' }, { label: number }]} />
      <SplitLayout
        asideLabel={t.summaryHeading}
        aside={
          <SummaryPanel
            id={SUMMARY_ID}
            heading={t.summaryHeading}
            rows={[
              { label: t.rows.payment, value: payment ? t.paymentStatuses[payment.status] : t.notAvailable },
              ...(payment ? [{ label: t.rows.paidVia, value: t.providers[payment.provider] }] : []),
              { label: t.rows.placedOn, value: formatLongDate(order.createdAt) },
            ]}
            total={{ label: t.labels.total, value: total }}
            actions={
              <>
                {order.status === 'PENDING_PAYMENT' && (
                  <FilledButton onClick={payNow}>
                    {t.actions.payPrefix} {total}
                    <Icon slot="trailing-icon" aria-hidden="true">
                      arrow_forward
                    </Icon>
                  </FilledButton>
                )}
                {order.status !== 'PENDING_PAYMENT' && (
                  <FilledButton onClick={() => navigate(`/orders/${order.id}/invoice`)}>
                    <Icon slot="icon" aria-hidden="true">
                      download
                    </Icon>
                    {t.actions.downloadInvoice}
                  </FilledButton>
                )}
                {canCancel && <OutlinedButton onClick={() => void cancel()}>{t.actions.cancelOrder}</OutlinedButton>}
              </>
            }
          />
        }
      >
        <div>
          <SectionHead
            id={TITLE_ID}
            as="h1"
            titleClassName="headline-medium"
            heading={fillTemplate(t.title.prefix + ' {number}', { number })}
            subheading={fillTemplate(t.placedOn, { date: formatLongDate(order.createdAt) })}
            actions={<sky-badge status={ORDER_STATUS_TONE[order.status]}>{content.orders.statuses[order.status]}</sky-badge>}
          />
          <StepIndicator
            label={t.progressLabel}
            steps={progress.steps}
            current={progress.current}
            doneLabel={content.checkout.stepDone}
            tone={order.status === 'CANCELLED' ? 'error' : 'primary'}
          />
        </div>

        {error && (
          <p className="form-field__error body-medium" role="alert">
            {error}
          </p>
        )}
        {order.status === 'PENDING_PAYMENT' && payment?.status === 'FAILED' && (
          <StatusPanel
            id="order-detail-payment-failed"
            as="h2"
            compact
            icon="error"
            tone="error"
            heading={t.paymentFailedHeading}
            text={payment.failureReason ?? t.labels.retryPayment}
          />
        )}
        {order.status === 'CANCELLED' && payment?.status === 'PAID' && (
          <StatusPanel id="order-detail-refund" as="h2" compact icon="currency_rupee" tone="neutral" heading={t.refundHeading} text={t.messages.refundAfterCancellation} />
        )}

        <section aria-labelledby={ITEMS_ID}>
          <SectionHead id={ITEMS_ID} heading={t.itemsHeading} titleClassName="title-large" />
          <PurchaseLineList>
            {order.items.map((item) => (
              <PurchaseLineCard key={item.id} line={lineFromOrderItem(item)} />
            ))}
          </PurchaseLineList>
        </section>

        {hasProducts && order.shippingAddress && (
          <section aria-labelledby={DELIVERY_ID}>
            <SectionHead id={DELIVERY_ID} heading={t.deliveryHeading} titleClassName="title-large" />
            <p className="body-large">
              {formatStreetAddress([order.shippingAddress, order.shippingCity, order.shippingState])} {order.shippingPincode}
            </p>
          </section>
        )}
      </SplitLayout>
    </PageSection>
  );
}

export default OrderDetail;
