import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { WIDGET_REGISTRY } from '../../dashboard/widget-registry';

/**
 * Renders `bootstrap.dashboardWidgets` (already resolved server-side for the
 * caller's roles), sorted by `order`, through the local `WIDGET_REGISTRY`.
 * Unknown widget keys are skipped rather than crashing the page.
 */
export function Dashboard() {
  const { bootstrap, loading } = useAuth();

  if (loading) {
    return (
      <div className="admin-page">
        <p className="loading-state">Loading dashboard…</p>
      </div>
    );
  }

  const widgets = [...(bootstrap?.dashboardWidgets ?? [])].sort((a, b) => a.order - b.order);

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
            return <Widget key={widget.key} title={widget.title} />;
          })}
        </div>
      )}
    </div>
  );
}

export default Dashboard;
