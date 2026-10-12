import { FilledButton, AssistChip, OutlinedButton } from '@skylabs-monorepo/shared-ui/react';
import type { Order } from '../../../api/orders';
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
        <>
            {false && (
                <sky-product-card
                    className="customer-order-card"
                    image={order.items?.[0]?.image || ''}
                    image-alt="Order"
                    // heading={`Order #${shortOrderId}...`}
                    heading={`Order #${order.id}`}
                    eyebrow={getStatusLabel(order.status)}
                    location={formatDate(order.createdAt)}
                    price={formatAmount(order.total)}
                    layout="horizontal"
                >
                    <div className="customer-order-card__footer">
                        <OutlinedButton onClick={() => onViewDetails(order)}>View Details</OutlinedButton>
                    </div>
                </sky-product-card>
            )}
            {/* NEW CARD */}
            <sky-tile-card  >
                <div className="customer-order-card-new">
                    {order.items?.[0]?.image && (
                        <img
                            className="customer-order-card-new__image"
                            src={order.items[0].image}
                            alt={order.items[0].itemName ?? 'Order item'}
                            width={120}
                            height={120}
                            loading="lazy"
                        />
                    )}
                    <div className="customer-order-card-new__content">
                        <div className="customer-order-card-new__top">
                            <div>
                                <p className="customer-order-card-new__eyebrow">Order</p>
                                <h3 className="customer-order-card-new__title">Order #{order.id}</h3>
                                <p className="customer-order-card-new__date">{formatDate(order.createdAt)}</p>
                            </div>
                            <sky-badge>{getStatusLabel(order.status)}</sky-badge>
                        </div>
                        <div className="customer-order-card-new__items">
                            {order.items?.map((item) => (
                                <div key={item.id} className="customer-order-card-new__item">
                                    <span>{item.itemName}</span>
                                    <span>Qty: {item.quantity}</span>
                                    <strong>{formatAmount(item.lineTotal)}</strong>
                                </div>
                            ))}
                        </div>
                        <div className="customer-order-card-new__bottom">
                            <strong className="customer-order-card-new__total">Total: {formatAmount(order.total)}</strong>
                            <OutlinedButton onClick={() => onViewDetails(order)}>View Details</OutlinedButton>
                        </div>
                    </div>
                </div>
            </sky-tile-card>
        </>
    );
}
export default CustomerOrderCard;