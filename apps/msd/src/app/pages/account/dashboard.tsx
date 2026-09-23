import { useEffect, useState } from 'react';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { DashboardProcessFlow } from './dashboard-process-flow';
import {
  getDashboardStats,
  type DashboardStats,
} from '../../../api/rbac/dashboard';

import { ApiRequestError } from '../../../api/rbac/client';

interface DashboardMetric {
  key: string;
  label: string;
  icon: string;
  value: string;
}

const DASHBOARD_CARD_ORDER = [
  'customers-count',
  'vendors-count',
  'products-count',
  'orders-recent',
];

function getMetricValue(
  stats: DashboardStats | null,
  key: string
): string {
  if (!stats) {
    return '—';
  }

  switch (key) {
    case 'customers-count':
      return stats.customers.toLocaleString('en-IN');

    case 'vendors-count':
      return stats.vendors.toLocaleString('en-IN');

    case 'products-count':
      return stats.products.toLocaleString('en-IN');

    case 'orders-recent':
      return stats.orders.toLocaleString('en-IN');
    default:
      return '—';
  }
}

export function Dashboard() {
  const { bootstrap, loading, token, can } = useAuth();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState('');

  useEffect(() => {
    let cancelled = false;

    setStatsLoading(true);
    setStatsError('');

    getDashboardStats(token)
      .then(({ data }) => {
        if (!cancelled) {
          setStats(data);
        }
      })
      .catch((err) => {
        if (cancelled) return;

        setStats(null);
        setStatsError(
          err instanceof ApiRequestError
            ? err.message
            : 'Could not load dashboard statistics.'
        );
      })
      .finally(() => {
        if (!cancelled) {
          setStatsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="admin-page admin-page--wide dashboard-page">
        <p className="loading-state">Loading dashboard…</p>
      </div>
    );
  }

  /*
   * Existing role-based dashboard widget configuration.
   * We are keeping this logic unchanged.
   */
  const widgets = [...(bootstrap?.dashboardWidgets ?? [])]
    .filter((widget) =>
      DASHBOARD_CARD_ORDER.includes(widget.key)
    )
    .sort(
      (a, b) =>
        DASHBOARD_CARD_ORDER.indexOf(a.key) -
        DASHBOARD_CARD_ORDER.indexOf(b.key)
    );

  /*
   * Existing permission check.
   *
   * Users with reports:view can see the complete marketplace
   * statistics. Other users continue to see only the widgets
   * assigned to their dashboard.
   */
  const showMarketplaceMetrics = can('reports', 'view');

  const dashboardMetrics: DashboardMetric[] = [];

  /*
   * First add the existing role-based dashboard widgets.
   */
  widgets.forEach((widget) => {
    const metricConfig: Record<
      string,
      { label: string; icon: string }
    > = {
      'customers-count': {
        label: widget.title || 'Customers',
        icon: 'groups',
      },

      'vendors-count': {
        label: widget.title || 'Vendors',
        icon: 'storefront',
      },

      'products-count': {
        label: widget.title || 'Products',
        icon: 'inventory_2',
      },

      'orders-recent': {
        label: widget.title || 'Orders',
        icon: 'shopping_bag',
      },
    };

    const config = metricConfig[widget.key];

    if (!config) return;

    dashboardMetrics.push({
      key: widget.key,
      label: config.label,
      icon: config.icon,
      value: getMetricValue(stats, widget.key),
    });
  });

  /*
   * For users who have reports:view, add the remaining
   * marketplace statistics to the SAME card grid.
   *
   * Customers, Vendors, Products and Orders are already present
   * above, so we only add the remaining five metrics here.
   */
  return (
    <div className="admin-page admin-page--wide dashboard-page">
      <title>Dashboard · MSD</title>

      {/* Dashboard Hero */}
      <header className="dashboard-hero">
        <div className="dashboard-hero__content">
          <div className="dashboard-hero__icon">
            <Icon aria-hidden="true">dashboard</Icon>
          </div>

          <div>
            <p className="dashboard-hero__eyebrow">
              MSD ADMIN CONSOLE
            </p>

            <h1 className="dashboard-hero__title">
              Dashboard
            </h1>

            <p className="dashboard-hero__subtitle">
              Welcome back, {bootstrap?.user.name ?? 'there'}.
              Here's your marketplace overview.
            </p>
          </div>
        </div>
      </header>

      {/* Dashboard Statistics */}
      {statsError ? (
        <section
          className="dashboard-error"
          aria-label="Dashboard error"
        >
          <Icon aria-hidden="true">error</Icon>

          <div>
            <h2>Unable to load dashboard statistics</h2>
            <p>{statsError}</p>
          </div>
        </section>
      ) : dashboardMetrics.length === 0 ? (
        <section
          className="dashboard-empty panel"
          aria-label="Dashboard widgets"
        >
          <Icon aria-hidden="true">
            dashboard_customize
          </Icon>

          <div>
            <h2>No dashboard widgets</h2>

            <p>
              No dashboard widgets are assigned to your role yet.
            </p>
          </div>
        </section>
   ) : (
  <>
    <section
      className="dashboard-stats"
      aria-label="Dashboard statistics"
    >
      {dashboardMetrics.map((metric) => (
        <div
          key={metric.key}
          className="dashboard-kpi-card"
        >
          <sky-info-card
            align="center"
            icon={metric.icon}
            heading={
              statsLoading
                ? '—'
                : metric.value
            }
            subheading={metric.label}
          />
        </div>
      ))}
    </section>

    {showMarketplaceMetrics && (
      <DashboardProcessFlow
        stats={stats}
        loading={statsLoading}
        error={statsError}
      />
    )}
  </>
)}
    </div>
  );
}

export default Dashboard;