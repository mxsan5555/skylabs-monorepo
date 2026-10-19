import { Icon } from '@skylabs-monorepo/shared-ui/react';
import type { Order } from '../../../api/orders';
import './product-order-timeline.css';

interface ProductOrderTimelineProps {
    status: Order['status'];
}
type TimelineStep = {
    label: string;
    icon: string;
};
const PRODUCT_STEPS: TimelineStep[] = [
    { label: 'Order Placed', icon: 'shopping_bag', },
    { label: 'Confirmed', icon: 'check_circle', },
    { label: 'Delivered', icon: 'local_shipping', },
];
function getCurrentStep(status: Order['status']): number {
    switch (status) {
        case 'PENDING_PAYMENT': return 0;
        case 'CONFIRMED': return 1;
        case 'COMPLETED': return 2;
        case 'CANCELLED': return 1;
        default: return 0;
    }
}
export function ProductOrderTimeline({
    status,
}: ProductOrderTimelineProps) {
    const isCancelled = status === 'CANCELLED';
    const currentStep = getCurrentStep(status);
    const steps: TimelineStep[] = isCancelled
        ? [
            { label: 'Order Placed', icon: 'shopping_bag', },
            { label: 'Cancelled', icon: 'cancel', },
        ] : PRODUCT_STEPS;
    return (
        <div className="product-order-timeline">
            {steps.map((step, index) => {
                const isCompleted = isCancelled ? index <= currentStep : index <= currentStep;
                const isCurrent = index === currentStep;
                return (
                    <div key={step.label} className="product-order-timeline__step">
                        <div
                            className={[
                                'product-order-timeline__indicator',
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
                        {index < steps.length - 1 && (
                            <div
                                className={[
                                    'product-order-timeline__connector',
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