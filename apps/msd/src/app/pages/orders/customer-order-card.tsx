import { FilledButton } from '@skylabs-monorepo/shared-ui/react';
import type { Order} from '../../../api/orders';
import content from '../../../content.json';

interface CustomerOrderCardProps {
    order: Order;
    onViewDetails: (order: Order) => void;
}

function formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function formatAmount(amount: string): string {
    return `₹${Number(amount).toLocaleString('en-IN')}`;
}

function getStatusLabel(status: Order['status']): string {
    return status.replace('_', ' ');
}

export function CustomerOrderCard({
  order,
  onViewDetails,
}: CustomerOrderCardProps) {
//   const shortOrderId = order.id.slice(0, 8);

  return (
        <sky-product-card
            className="customer-order-card"
            image={content.orders.placeholderImage}
            image-alt="Order"
            // heading={`Order #${shortOrderId}...`}
            heading={`Order #${order.id}`}
            eyebrow={getStatusLabel(order.status)}
            location={formatDate(order.createdAt)}
            price={formatAmount(order.total)}
            layout="horizontal"
        >


            <div className="customer-order-card__footer">
                <FilledButton onClick={() => onViewDetails(order)}>
                    View Details
                </FilledButton>
            </div>
        </sky-product-card>
    );
}

export default CustomerOrderCard;