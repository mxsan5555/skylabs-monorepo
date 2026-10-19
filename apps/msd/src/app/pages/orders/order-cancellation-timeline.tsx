import { Icon } from '@skylabs-monorepo/shared-ui/react';
import type { Order } from '../../../api/orders';
import './order-cancellation-timeline.css';

interface OrderCancellationTimelineProps {
    order: Order;
}

type TimelineStep = {
    label: string;
    icon: string;
    date: string;
    variant: 'completed' | 'cancelled';
};

function formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

export function OrderCancellationTimeline({
    order,
}: OrderCancellationTimelineProps) {
    const steps: TimelineStep[] = [
        {
            label: 'Order Confirmed',
            icon: 'check_circle',
            date: formatDate(order.createdAt),
            variant: 'completed',
        },
        {
            label: 'Cancelled',
            icon: 'cancel',
            date: formatDate(order.updatedAt),
            variant: 'cancelled',
        },
    ];

    return (
        <div className="order-cancellation-timeline">
            {steps.map((step, index) => {
                const isCurrent = index === steps.length - 1;

                return (
                    <div
                        key={step.label}
                        className="order-cancellation-timeline__step"
                    >
                        <div
                            className={[
                                'order-cancellation-timeline__indicator',
                                `order-cancellation-timeline__indicator--${step.variant}`,
                                isCurrent
                                    ? 'order-cancellation-timeline__indicator--current'
                                    : '',
                            ]
                                .filter(Boolean)
                                .join(' ')}
                        >
                            <Icon aria-hidden="true">
                                {step.icon}
                            </Icon>
                        </div>

                        <div className="order-cancellation-timeline__content">
                            <span className="order-cancellation-timeline__label">
                                {step.label}
                            </span>

                            <span className="order-cancellation-timeline__date">
                                {step.date}
                            </span>
                        </div>

                        {index < steps.length - 1 && (
                            <div
                                className="order-cancellation-timeline__connector order-cancellation-timeline__connector--completed"
                                aria-hidden="true"
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export default OrderCancellationTimeline;