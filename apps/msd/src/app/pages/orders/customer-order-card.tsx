import { OutlinedButton } from '@skylabs-monorepo/shared-ui/react';
import type { Order, OrderStatus } from '../../../api/orders';
import { fillTemplate, formatINR, formatLongDate, orderNumber } from '../../../utils/format';
import { lineFromOrderItem } from '../../../utils/cart-items';
import { PurchaseLineCard, PurchaseLineList } from '../../components/purchase-line-card/purchase-line-card';
import { SummaryPanel } from '../../components/summary-panel/summary-panel';
import content from '../../../content.json';

const t = content.orders;

/** Tonal `sky-badge` status per order state (order list and order page). */
export const ORDER_STATUS_TONE: Record<OrderStatus, 'success' | 'warning' | 'error'> = {
  PENDING_PAYMENT: 'warning',
  CONFIRMED: 'success',
  COMPLETED: 'success',
  CANCELLED: 'error',
};

interface CustomerOrderCardProps {
  order: Order;
  onViewDetails: (order: Order) => void;
  /** `h3` when the list sits under a section heading (dashboard). */
  headingLevel?: 'h2' | 'h3';
}

/**
 * One order in the customer's list (orders page, dashboard): a receipt panel named by the short
 * order number, with the date, item count and status. One checkout can hold deals, products and
 * therapists from several members, so every line shows its own image, member and branch and links
 * to its detail page in a new tab (item 3 follow-up).
 */
export function CustomerOrderCard({ order, onViewDetails, headingLevel = 'h2' }: CustomerOrderCardProps) {
  const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const itemCount = count === 1 ? t.itemCountOne : fillTemplate(t.itemCountMany, { count: String(count) });
  return (
    <SummaryPanel
      id={`order-${order.id}`}
      as={headingLevel}
      heading={fillTemplate(t.orderLabel, { number: orderNumber(order.id) })}
      meta={
        <>
          <span>
            {formatLongDate(order.createdAt)} · {itemCount}
          </span>
          <sky-badge status={ORDER_STATUS_TONE[order.status]}>{t.statuses[order.status]}</sky-badge>
        </>
      }
      total={{ label: t.total, value: formatINR(Number(order.total)) }}
      actions={<OutlinedButton onClick={() => onViewDetails(order)}>{t.viewDetails}</OutlinedButton>}
      inlineActions
    >
      <PurchaseLineList variant="receipt">
        {order.items.map((item) => (
          <PurchaseLineCard key={item.id} line={lineFromOrderItem(item)} />
        ))}
      </PurchaseLineList>
    </SummaryPanel>
  );
}

export default CustomerOrderCard;
