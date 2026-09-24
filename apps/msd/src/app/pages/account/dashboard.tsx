import { useEffect, useState } from 'react';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { WIDGET_REGISTRY } from '../../dashboard/widget-registry';
import {
  getDashboardStats,
  type DashboardStats,
} from '../../../api/rbac/dashboard';
import { ApiRequestError } from '../../../api/rbac/client';
import { DashboardProcessFlow } from './dashboard-process-flow';

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

  console.log("the data in the stats is", stats);

  if (loading) {
    return (
      <div className="admin-page admin-page--wide dashboard-page">
        <p className="loading-state">Loading dashboard…</p>
      </div>
    );
  }

  const dashboardCardOrder = [
    'customers-count',
    'vendors-count',
    'products-count',
    'orders-recent',
    'deals-count',
    'services-coount'
  ];

  const widgets = [...(bootstrap?.dashboardWidgets ?? [])]
    .filter((widget) => dashboardCardOrder.includes(widget.key))
    .sort(
      (a, b) =>
        dashboardCardOrder.indexOf(a.key) -
        dashboardCardOrder.indexOf(b.key)
    );

  const showProcessFlow = can('reports', 'view');
  return (
    <div className="admin-page admin-page--wide dashboard-page">
      <title>Dashboard · MSD</title>
      <header className="dashboard-hero">
        <div className="dashboard-hero__content">
          <div className="dashboard-hero__icon">
            <Icon aria-hidden="true">dashboard</Icon>
          </div>
          <div>
            <p className="dashboard-hero__eyebrow">MSD ADMIN CONSOLE</p>

            <h1 className="dashboard-hero__title">Dashboard</h1>

            <p className="dashboard-hero__subtitle">
              Welcome back, {bootstrap?.user.name ?? 'there'}. Here's your
              marketplace overview.
            </p>
          </div>
        </div>
      </header>

      {/* Dynamic role-based widgets */}
      {widgets.length === 0 ? (
        <section className="dashboard-empty panel">
          <Icon aria-hidden="true">dashboard_customize</Icon>

          <div>
            <h2>No dashboard widgets</h2>
            <p>
              No dashboard widgets are assigned to your role yet.
            </p>
          </div>
        </section>
      ) : (
        <section
          className="dashboard-stats"
          aria-label="Marketplace statistics"
        >
          {widgets.map((widget) => {
            const Widget = WIDGET_REGISTRY[widget.key];

            if (!Widget) return null;

            return (
              <Widget
                key={widget.key}
                title={widget.title}
                stats={stats}
                statsLoading={statsLoading}
                statsError={statsError}
              />
            );
          })}
        </section>
      )}
      {/* Marketplace Overview */}
      {showProcessFlow && (
        <section className="dashboard-section" aria-labelledby="marketplace-heading">
          <div className="dashboard-section__header">
            <div>
              <h2
                id="marketplace-heading"
                className="dashboard-section__title"
              >
                Marketplace Overview
              </h2>

              <p className="dashboard-section__description">
                Catalog, supply and activity at a glance
              </p>
            </div>
          </div>

          <DashboardProcessFlow
            stats={stats}
            loading={statsLoading}
            error={statsError}
          />
        </section>
      )}
    </div>
  );
}

export default Dashboard;