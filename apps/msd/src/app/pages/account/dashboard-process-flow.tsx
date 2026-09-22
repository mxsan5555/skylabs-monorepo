import { Icon } from '@skylabs-monorepo/shared-ui/react';
import type { DashboardStats } from '../../../api/rbac/dashboard';
import { formatINR } from '../../../utils/format';

interface DashboardMarketplaceOverviewProps {
  stats: DashboardStats | null;
  loading: boolean;
  error: string;
}

interface MarketplaceMetric {
  label: string;
  value: string;
  icon: string;
}

export function DashboardProcessFlow({
  stats,
  loading,
  error,
}: DashboardMarketplaceOverviewProps) {
  const catalogMetrics: MarketplaceMetric[] = [
    {
      label: 'Categories',
      value: stats ? stats.categories.toLocaleString('en-IN') : '—',
      icon: 'category',
    },
    {
      label: 'Sub Categories',
      value: stats ? stats.subCategories.toLocaleString('en-IN') : '—',
      icon: 'account_tree',
    },
    {
      label: 'Products',
      value: stats ? stats.products.toLocaleString('en-IN') : '—',
      icon: 'inventory_2',
    },
    {
      label: 'Deals',
      value: stats ? stats.deals.toLocaleString('en-IN') : '—',
      icon: 'local_offer',
    },
  ];

  const supplyMetrics: MarketplaceMetric[] = [
    {
      label: 'Vendors',
      value: stats ? stats.vendors.toLocaleString('en-IN') : '—',
      icon: 'storefront',
    },
    {
      label: 'Branches',
      value: stats ? stats.branches.toLocaleString('en-IN') : '—',
      icon: 'location_on',
    },
  ];

  const activityMetrics: MarketplaceMetric[] = [
    {
      label: 'Orders',
      value: stats ? stats.orders.toLocaleString('en-IN') : '—',
      icon: 'shopping_bag',
    },
    {
      label: 'Revenue',
      value: stats ? formatINR(Number(stats.revenue)) : '—',
      icon: 'payments',
    },
  ];

  const groups = [
    {
      key: 'catalog',
      title: 'CATALOG',
      icon: 'inventory_2',
      metrics: catalogMetrics,
    },
    {
      key: 'supply',
      title: 'SUPPLY',
      icon: 'storefront',
      metrics: supplyMetrics,
    },
    {
      key: 'activity',
      title: 'ACTIVITY',
      icon: 'monitoring',
      metrics: activityMetrics,
    },
  ];

  return (
    <section className="dashboard-marketplace" aria-label="Marketplace overview">
      {loading && (
        <p className="loading-state">Loading marketplace overview…</p>
      )}

      {!loading && error && (
        <p className="error-state" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && (
        <div className="dashboard-marketplace__grid">
          {groups.map((group) => (
            <article
              key={group.key}
              className="dashboard-marketplace__group"
            >
              <div className="dashboard-marketplace__group-header">
                <Icon aria-hidden="true">{group.icon}</Icon>
                <h3>{group.title}</h3>
              </div>

              <div className="dashboard-marketplace__metrics">
                {group.metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="dashboard-marketplace__metric"
                  >
                    <div className="dashboard-marketplace__metric-label">
                      <Icon aria-hidden="true">{metric.icon}</Icon>
                      <span>{metric.label}</span>
                    </div>

                    <strong>{metric.value}</strong>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default DashboardProcessFlow;