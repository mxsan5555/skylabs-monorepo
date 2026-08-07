import type { ComponentType } from 'react';

interface WidgetProps {
  title: string;
}

/**
 * Local app registry mapping a `WidgetConfig.key` (as assigned to a role by
 * `PUT /rbac/roles/:id/widgets`) to the component that renders it. Keys are
 * data, not code — new widgets get added here as the catalog grows; unknown
 * keys are skipped by the dashboard page rather than crashing.
 */

function CustomersCountWidget({ title }: WidgetProps) {
  return (
    <article className="stat-card">
      <h2 className="stat-card__title">{title}</h2>
      <p className="stat-card__value">1,284</p>
    </article>
  );
}

function OrdersRecentWidget({ title }: WidgetProps) {
  const recent = [
    { id: 'ORD-2291', label: 'Deep tissue massage · 2 sessions' },
    { id: 'ORD-2290', label: 'Couples spa package' },
    { id: 'ORD-2289', label: 'Foot reflexology · 1 session' },
  ];
  return (
    <article className="stat-card">
      <h2 className="stat-card__title">{title}</h2>
      <ul className="stat-card__list">
        {recent.map((order) => (
          <li key={order.id}>
            {order.id} — {order.label}
          </li>
        ))}
      </ul>
    </article>
  );
}

function RevenueSummaryWidget({ title }: WidgetProps) {
  return (
    <article className="stat-card">
      <h2 className="stat-card__title">{title}</h2>
      <p className="stat-card__value">₹4.2L</p>
    </article>
  );
}

export const WIDGET_REGISTRY: Record<string, ComponentType<WidgetProps>> = {
  'customers-count': CustomersCountWidget,
  'orders-recent': OrdersRecentWidget,
  'revenue-summary': RevenueSummaryWidget,
};
