import { Icon } from '@skylabs-monorepo/shared-ui/react';
import type { Order } from '../../../api/orders';
import './product-order-timeline.css';
interface ProductOrderTimelineProps {
    status: Order['status'];
    paymentStatus?: string;
}
type TimelineStep = {
    label: string;
    icon: string;
};
const PRODUCT_STEPS: TimelineStep[] = [
    { label: 'Ordered', icon: 'shopping_bag' },
    { label: 'Payment Successful', icon: 'payments' },
    { label: 'Order Dispatched', icon: 'local_shipping' },
    { label: 'Delivered', icon: 'inventory_2' },
];
function getCurrentStep(
    status: Order['status'],
    paymentStatus?: string,
): number {
    if (status === 'COMPLETED') { return 3; }
    if (status === 'CONFIRMED' && paymentStatus === 'PAID') { return 1; }
    return 0;
}
export function ProductOrderTimeline({ status, paymentStatus,
}: ProductOrderTimelineProps) {
    const currentStep = getCurrentStep(status, paymentStatus);
    return (
        <div className="product-order-timeline" aria-label="Product order progress">
            {PRODUCT_STEPS.map((step, index) => {
                const isCompleted = index <= currentStep;
                const isCurrent = index === currentStep;
                return (
                    <div key={step.label} className="product-order-timeline__step" >
                        <div
                            className={['product-order-timeline__indicator',
                                isCompleted ? 'product-order-timeline__indicator--completed' : '',
                                isCurrent ? 'product-order-timeline__indicator--current' : '',
                            ].filter(Boolean).join(' ')}>
                            <Icon aria-hidden="true">{step.icon}</Icon>
                        </div>
                        <div className="product-order-timeline__content">
                            <span className="product-order-timeline__label">{step.label}</span>
                            {isCurrent && (
                                <span className="product-order-timeline__current">Current status</span>
                            )}
                        </div>
                        {index < PRODUCT_STEPS.length - 1 && (
                            <div
                                className={['product-order-timeline__connector',
                                    index < currentStep ? 'product-order-timeline__connector--completed' : '',
                                ].filter(Boolean).join(' ')}
                                aria-hidden="true"
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
export default ProductOrderTimeline;
