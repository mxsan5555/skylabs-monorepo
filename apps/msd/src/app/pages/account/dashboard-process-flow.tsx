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
  const marketplaceMetrics: MarketplaceMetric[] = [
    {
      label: 'Total Categories',
      value: stats
        ? stats.categories.toLocaleString('en-IN')
        : '—',
      icon: 'category',
    },
    {
      label: 'Total Sub-Categories',
      value: stats
        ? stats.subCategories.toLocaleString('en-IN')
        : '—',
      icon: 'account_tree',
    },
    {
      label: 'Total Deals',
      value: stats
        ? stats.deals.toLocaleString('en-IN')
        : '—',
      icon: 'local_offer',
    },
    {
      label: 'Total Branches',
      value: stats
        ? stats.branches.toLocaleString('en-IN')
        : '—',
      icon: 'location_on',
    },
    {
      label: 'Total Revenue',
      value: stats
        ? formatINR(Number(stats.revenue))
        : '—',
      icon: 'payments',
    },
  ];

  return (
    <section
      className="dashboard-marketplace"
      aria-label="Marketplace overview"
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

      {!loading && !error && (
        <div className="dashboard-marketplace__metrics">
          {marketplaceMetrics.map((metric) => (
            <div
              key={metric.label}
              className="dashboard-marketplace__metric"
            >
              <sky-info-card
                align="center"
                icon={metric.icon}
                heading={metric.value}
                subheading={metric.label}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default DashboardProcessFlow;