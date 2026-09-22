import { useEffect, useState } from 'react';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  getDashboardStats,
  type DashboardStats,
} from '../../../api/rbac/dashboard';
import { ApiRequestError } from '../../../api/rbac/client';
import { DashboardProcessFlow } from './dashboard-process-flow';

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

  return (
    <div className="admin-page admin-page--wide dashboard-page">
      <title>Dashboard · MSD</title>

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
              Welcome back, {bootstrap?.user.name ?? 'there'}. Here's your
              marketplace overview.
            </p>
          </div>
        </div>
      </header>

      <DashboardProcessFlow
        stats={stats}
        loading={statsLoading}
        error={statsError}
      />
    </div>
  );
}

export default Dashboard;