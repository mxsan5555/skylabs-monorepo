import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FilledButton, OutlinedButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getMyOrder, type Order } from '../../../api/orders';
import { fillTemplate, formatINR, formatLongDate, orderNumber } from '../../../utils/format';
import { lineFromOrderItem } from '../../../utils/cart-items';
import { PurchaseLineCard, PurchaseLineList } from '../../components/purchase-line-card/purchase-line-card';
import { SummaryPanel } from '../../components/summary-panel/summary-panel';
import { PageSection } from '../../components/page-section/page-section';
import { SplitLayout } from '../../components/split-layout/split-layout';
import { StatusPanel, type StatusTone } from '../../components/status-panel/status-panel';
import { Seo } from '../../seo/seo';
import content from '../../../content.json';

const t = content.orderResult;
const HEAD_ID = 'order-result-title';
const SUMMARY_ID = 'order-result-summary';

export type OrderOutcome = 'success' | 'failed' | 'pending' | 'cancelled' | 'error';

/**
 * What the page says, from the server's order (never from the URL alone): confirmed or completed
 * is a success; an unpaid order whose latest payment failed (or that checkout just reported as
 * failed) is a failure; an unpaid order with no failed attempt is still waiting for payment.
 */
export function outcomeOf(order: Order | null, reportedFailed: boolean): OrderOutcome {
  if (!order) return 'error';
  if (order.status === 'CONFIRMED' || order.status === 'COMPLETED') return 'success';
  if (order.status === 'CANCELLED') return 'cancelled';
  const latest = [...order.payments].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return latest?.status === 'FAILED' || reportedFailed ? 'failed' : 'pending';
}

const ICONS: Record<OrderOutcome, { icon: string; tone: StatusTone }> = {
  success: { icon: 'check', tone: 'success' },
  failed: { icon: 'priority_high', tone: 'error' },
  pending: { icon: 'schedule', tone: 'neutral' },
  cancelled: { icon: 'block', tone: 'neutral' },
  error: { icon: 'cloud_off', tone: 'error' },
};


/**
 * Item 3: the page checkout lands on after paying, placing a cash-on-delivery order, or a failed
 * payment. Thank-you, payment failed, waiting for payment, cancelled and could-not-load states,
 * each with the next step (pay again, view the order, my orders, help). Focus moves to the heading
 * so screen readers announce the result.
 */
export function OrderResult() {
  const { id = '' } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    getMyOrder(token, id)
      .then(({ data }) => setOrder(data))
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [token, id]);
  useEffect(() => {
    load();
  }, [load]);

  const outcome = outcomeOf(order, params.get('payment') === 'failed');
  useEffect(() => {
    if (loading) return;
    const heading = document.getElementById(HEAD_ID);
    heading?.setAttribute('tabindex', '-1');
    heading?.focus();
  }, [loading, outcome]);

  if (loading) return <p className="loading-state" role="status">{t.loading}</p>;

  const copy = t[outcome];
  const values = { number: orderNumber(id), email: order?.contactEmail ?? '' };
  const text = outcome === 'success' && !order?.contactEmail ? t.success.textNoEmail : copy.text;
  const count = order?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const itemCount = count === 1 ? t.itemCountOne : t.itemCountMany.replace('{count}', String(count));

  return (
    <>
      <Seo title={copy.heading} description={t.metaDescription} path={`/orders/${id}/confirmation`} noindex />
      <PageSection aria-labelledby={HEAD_ID}>
        <SplitLayout
          asideLabel={t.summaryHeading}
          aside={
            order && (
              <SummaryPanel id={SUMMARY_ID} heading={t.summaryHeading} meta={itemCount} total={{ label: t.total, value: formatINR(Number(order.total)) }}>
                <PurchaseLineList variant="receipt">
                  {order.items.map((item) => (
                    <PurchaseLineCard key={item.id} line={lineFromOrderItem(item)} />
                  ))}
                </PurchaseLineList>
              </SummaryPanel>
            )
          }
        >
          <StatusPanel
            id={HEAD_ID}
            icon={ICONS[outcome].icon}
            tone={ICONS[outcome].tone}
            heading={copy.heading}
            text={fillTemplate(text, values)}
            facts={
              order
                ? [
                    { label: t.orderNumberLabel, value: values.number },
                    { label: t.placedOnLabel, value: formatLongDate(order.createdAt) },
                  ]
                : undefined
            }
            actions={
              <>
                {outcome === 'failed' || outcome === 'pending' ? (
                  <FilledButton onClick={() => navigate('/checkout', { state: { orderId: id } })}>{t.payAgain}</FilledButton>
                ) : outcome === 'error' ? (
                  <FilledButton onClick={load}>{t.tryAgain}</FilledButton>
                ) : (
                  <FilledButton onClick={() => navigate(`/orders/${id}`)}>{t.viewOrder}</FilledButton>
                )}
                {outcome === 'success' || outcome === 'cancelled' ? (
                  <OutlinedButton onClick={() => navigate('/')}>{t.continueShopping}</OutlinedButton>
                ) : (
                  <OutlinedButton onClick={() => navigate('/orders')}>{t.myOrders}</OutlinedButton>
                )}
              </>
            }
            footer={
              <Link className="text-link" to="/contact">
                {t.help}
              </Link>
            }
          />
        </SplitLayout>
      </PageSection>
    </>
  );
}

export default OrderResult;
