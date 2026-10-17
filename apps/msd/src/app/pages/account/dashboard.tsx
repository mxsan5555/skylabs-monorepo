import { useEffect, useState } from 'react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { DashboardGroups } from './dashboard-groups';
import {
  getDashboardStats,
  type DashboardStats,
} from '../../../api/rbac/dashboard';
import { ApiRequestError } from '../../../api/rbac/client';

export function Dashboard() {
  const { bootstrap, loading, token } = useAuth();

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

  const widgetKeys = (bootstrap?.dashboardWidgets ?? []).map((widget) => widget.key);

  return (
    <div className="admin-page admin-page--wide dashboard-page">
      <title>Dashboard · MSD</title>

      <header className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Welcome back, {bootstrap?.user.name ?? 'there'}. Here's your marketplace overview.</p>
        </div>
      </header>

      {/* Dashboard Content */}
      {statsError ? (
        <sky-feature-card
          color="tertiary"
          icon="error"
          iconStyle="surface"
          headline="Unable to load dashboard statistics"
          text={statsError}
        />
      ) : (
        <DashboardGroups stats={stats} loading={statsLoading} widgetKeys={widgetKeys} />
      )}
    </div>
  );
}

export default Dashboard;