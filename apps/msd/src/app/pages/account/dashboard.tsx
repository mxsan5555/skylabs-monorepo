import { useEffect, useState } from 'react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { WIDGET_REGISTRY } from '../../dashboard/widget-registry';
import { getDashboardStats, type DashboardStats } from '../../../api/rbac/dashboard';
import { ApiRequestError } from '../../../api/rbac/client';
import { DashboardProcessFlow } from './dashboard-process-flow';

/**
 * Renders `bootstrap.dashboardWidgets` (already resolved server-side for the
 * caller's roles), sorted by `order`, through the local `WIDGET_REGISTRY`.
 * Unknown widget keys are skipped rather than crashing the page.
 *
 * `GET /dashboard/stats` is fetched once here (not per-widget) and handed down to every
 * widget as a prop — same permission (`dashboard:view`) that already gates this whole route,
 * so every caller who reaches this page is allowed to call it.
 */
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
        if (!cancelled) setStats(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setStats(null);
        setStatsError(err instanceof ApiRequestError ? err.message : 'Could not load dashboard statistics.');
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="admin-page">
        <p className="loading-state">Loading dashboard…</p>
      </div>
    );
  }

  const widgets = [...(bootstrap?.dashboardWidgets ?? [])].sort((a, b) => a.order - b.order);
  // Reports access is the closest existing permission signal for "wants a marketplace-wide
  // overview" — held by super_admin/admin/sales/marketing, never by customer/vendor (who only
  // see their own scoped data) — no role name is checked here.
  const showProcessFlow = can('reports', 'view');

  return (
    <div className="admin-page admin-page--wide">
      <title>Dashboard · MSD</title>
      <header className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Welcome back, {bootstrap?.user.name ?? 'there'}.</p>
        </div>
      </header>

      {widgets.length === 0 ? (
        <p className="empty-state">No dashboard widgets are assigned to your role yet.</p>
      ) : (
        <div className="widget-grid">
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
        </div>
      )}

      {showProcessFlow && <DashboardProcessFlow stats={stats} loading={statsLoading} error={statsError} />}
    </div>
  );
}

export default Dashboard;
