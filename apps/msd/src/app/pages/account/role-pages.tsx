
import { AdminPage } from '../../admin/admin-page';

/**
 * Placeholder console pages. Dashboard is for everyone; the others are gated to
 * a single role (see routes) to demonstrate role-based access. Real content
 * arrives with each domain's backend.
 */

export function Dashboard() {
  return (
    <AdminPage title="Dashboard" subtitle="An overview of your account activity.">
      <sky-card>Welcome back. Pick a section from the sidebar.</sky-card>
    </AdminPage>
  );
}

export function Deals() {
  return (
    <AdminPage title="Deals" subtitle="Admin only — upload and manage massage deals.">
      <sky-card>Deal upload tools go here.</sky-card>
    </AdminPage>
  );
}

export function Promotions() {
  return (
    <AdminPage
      title="Promotions"
      subtitle="Marketing only — create and schedule promotions."
    >
      <sky-card>Promotion builder goes here.</sky-card>
    </AdminPage>
  );
}

export function Sales() {
  return (
    <AdminPage title="Sales" subtitle="Sales only — track revenue and conversions.">
      <sky-card>Sales dashboards go here.</sky-card>
    </AdminPage>
  );
}
