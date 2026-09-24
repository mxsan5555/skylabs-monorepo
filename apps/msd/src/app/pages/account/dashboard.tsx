import { useEffect, useState } from 'react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { DashboardProcessFlow } from './dashboard-process-flow';
import {
  getDashboardStats,
  type DashboardStats,
} from '../../../api/rbac/dashboard';
import { ApiRequestError } from '../../../api/rbac/client';

export interface DashboardMetric {
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
   */
  const widgets = [...(bootstrap?.dashboardWidgets ?? [])]
    .filter((widget) => DASHBOARD_CARD_ORDER.includes(widget.key))
    .sort(
      (a, b) =>
        DASHBOARD_CARD_ORDER.indexOf(a.key) -
        DASHBOARD_CARD_ORDER.indexOf(b.key)
    );

  /*
   * Users with reports:view can see marketplace statistics.
   */
  const showMarketplaceMetrics = can('reports', 'view');

  /*
   * Existing role-based dashboard widgets.
   */
  const dashboardMetrics: DashboardMetric[] = [];

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

  return (
    <div className="admin-page admin-page--wide dashboard-page">
      <title>Dashboard · MSD</title>

      {/* Dashboard Hero */}
      <sky-feature-card
        color="secondary"
        icon="dashboard"
        iconStyle="surface"
        variant="filled"
        iconShape="full"
        headline="Dashboard"
        text={`Welcome back, ${bootstrap?.user.name ?? 'there'
          }. Here's your marketplace overview.`}
      />

      {/* Dashboard Content */}
      {statsError ? (
        <sky-feature-card
          color="tertiary"
          icon="error"
          iconStyle="surface"
          headline="Unable to load dashboard statistics"
          text={statsError}
        />
      ) : dashboardMetrics.length === 0 ? (
        <sky-feature-card
          color="surface-high"
          icon="dashboard_customize"
          iconStyle="surface"
          headline="No dashboard widgets"
          text="No dashboard widgets are assigned to your role yet."
        />
      ) : (
        <DashboardProcessFlow
          stats={stats}
          loading={statsLoading}
          dashboardMetrics={dashboardMetrics}
          showMarketplaceMetrics={showMarketplaceMetrics}
        />
      )}
    </div>
  );
}

export default Dashboard;