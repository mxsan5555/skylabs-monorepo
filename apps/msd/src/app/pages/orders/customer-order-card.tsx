
import type { Order } from '../../../api/orders';
import { formatINR } from '../../../utils/format';

interface CustomerOrderCardProps {
  order: Order;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

function getBadgeColor(
  status: Order['status'],
): 'error' | 'tertiary' | 'primary' {
  if (status === 'CANCELLED') return 'error';
  if (status === 'PENDING_PAYMENT') return 'tertiary';
  return 'primary';
}

export function CustomerOrderCard({ order }: CustomerOrderCardProps) {
  const items = order.items ?? [];
  const firstItem = items[0];
  const imageItem = items.find((item) => item.image);
  const paidPayment = order.payments?.find(
    (payment) => payment.status === 'PAID',
  );
  const latestPayment = order.payments?.[0];

  const paymentStatus = paidPayment
    ? 'PAID'
    : latestPayment?.status ?? 'PAYMENT PENDING';

  const itemSummary = firstItem
    ? `${firstItem.itemName} · Qty: ${firstItem.quantity}${
        items.length > 1 ? ` · +${items.length - 1} more item(s)` : ''
      }`
    : `${items.length} items`;
const orderDetails = [
  order.type === 'PRODUCT' ? 'Product order' : 'Service order',
  itemSummary,
  `Placed on ${formatDate(order.createdAt)}`,
  `Payment: ${formatStatus(paymentStatus)}`,
].join('\n');
  return (
    <sky-product-card
      layout="horizontal"
      variant="outlined"
      {...(imageItem?.image
        ? {
            image: imageItem.image,
            imageAlt: imageItem.itemName ?? 'Order item',
          }
        : {})}
      heading={`Order #${order.id}`}
      eyebrow={order.vendorNameSnapshot || 'Vendor'}
      description={orderDetails}
      badge={formatStatus(order.status)}
      badgeColor={getBadgeColor(order.status)}
      price={formatINR(Number(order.total))}
      href={`/orders/${order.id}`}
    />
  );
}

export default CustomerOrderCard;
