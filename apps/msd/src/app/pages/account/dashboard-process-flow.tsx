import type { DashboardStats } from '../../../api/rbac/dashboard';
import { formatINR } from '../../../utils/format';
import type { DashboardMetric } from './dashboard';

interface DashboardProcessFlowProps {
  stats: DashboardStats | null;
  loading: boolean;
  dashboardMetrics: DashboardMetric[];
  showMarketplaceMetrics: boolean;
}

interface MarketplaceMetric {
  key: string;
  label: string;
  value: string;
  icon: string;
}

export function DashboardProcessFlow({
  stats,
  loading,
  dashboardMetrics,
  showMarketplaceMetrics,
}: DashboardProcessFlowProps) {
  const marketplaceMetrics: MarketplaceMetric[] = [
    {
      key: 'categories-count',
      label: 'Total Categories',
      value: stats
        ? stats.categories.toLocaleString('en-IN')
        : '—',
      icon: 'category',
    },
    {
      key: 'subcategories-count',
      label: 'Total Sub-Categories',
      value: stats
        ? stats.subCategories.toLocaleString('en-IN')
        : '—',
      icon: 'account_tree',
    },
    {
      key: 'deals-count',
      label: 'Total Deals',
      value: stats
        ? stats.deals.toLocaleString('en-IN')
        : '—',
      icon: 'local_offer',
    },
    {
      key: 'branches-count',
      label: 'Total Branches',
      value: stats
        ? stats.branches.toLocaleString('en-IN')
        : '—',
      icon: 'location_on',
    },
    {
      key: 'revenue-total',
      label: 'Total Revenue',
      value: stats
        ? formatINR(Number(stats.revenue))
        : '—',
      icon: 'payments',
    },
  ];

  const allMetrics: DashboardMetric[] = [
    ...dashboardMetrics,
    ...(showMarketplaceMetrics
      ? marketplaceMetrics
      : []),
  ];

  return (
    <section
      className="dashboard-stats"
      aria-label="Dashboard statistics"
    >
      {allMetrics.map((metric) => (
        <sky-tile-card
          key={metric.key}
          icon={metric.icon}
          headline={loading ? '—' : metric.value}
          text={metric.label}
          variant="filled"
          iconShape="full"
          align="center"
        />
      ))}
    </section>
  );
}

export default DashboardProcessFlow;