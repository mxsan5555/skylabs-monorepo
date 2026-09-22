import type { DashboardStats } from '../../../api/rbac/dashboard';
import { formatINR } from '../../../utils/format';

interface DashboardMarketplaceOverviewProps {
  stats: DashboardStats | null;
  loading: boolean;
  error: string;
}

interface MarketplaceMetric {
  label: string;
  stat: keyof DashboardStats;
  icon: string;
}

export function DashboardProcessFlow({
  stats,
  loading,
  error,
}: DashboardMarketplaceOverviewProps) {
  const dashboardMetrics: MarketplaceMetric[] = [
    {
      label: 'Categories',
      stat: 'categories',
      icon: 'category',
    },
    {
      label: 'Sub Categories',
      stat: 'subCategories',
      icon: 'account_tree',
    },
    {
      label: 'Products',
      stat: 'products',
      icon: 'inventory_2',
    },
    {
      label: 'Deals',
      stat: 'deals',
      icon: 'local_offer',
    },
    {
      label: 'Vendors',
      stat: 'vendors',
      icon: 'storefront',
    },
    {
      label: 'Branches',
      stat: 'branches',
      icon: 'location_on',
    },
    {
      label: 'Orders',
      stat: 'orders',
      icon: 'shopping_bag',
    },
    {
      label: 'Revenue',
      stat: 'revenue',
      icon: 'payments',
    },
  ];

  return (
    <section
      className="dashboard-stats"
      aria-label="Marketplace statistics"
    >
      {loading && (
        <p className="loading-state">
          Loading marketplace overview…
        </p>
      )}

      {!loading && error && (
        <p className="error-state" role="alert">
          {error}
        </p>
      )}

      {!loading &&
        !error &&
        dashboardMetrics.map((metric) => {
          const rawValue = stats?.[metric.stat];

          const value =
            metric.stat === 'revenue'
              ? formatINR(Number(rawValue ?? 0))
              : Number(rawValue ?? 0).toLocaleString('en-IN');

          return (
            <sky-info-card
              key={metric.stat}
              align="center"
              icon={metric.icon}
              heading={metric.label}
              subheading={value}
            />
          );
        })}
    </section>
  );
}

export default DashboardProcessFlow;