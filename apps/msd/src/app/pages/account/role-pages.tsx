import { SkyCardReact } from '@skylabs-monorepo/shared-ui/react';
import { AdminPage } from '../../admin/admin-page';

/**
 * Placeholder console pages. Dashboard is for everyone; the others are gated to
 * a single role (see routes) to demonstrate role-based access. Real content
 * arrives with each domain's backend.
 */

export function Dashboard() {
  return (
    <AdminPage title="Dashboard" subtitle="An overview of your account activity.">
      <SkyCardReact>Welcome back. Pick a section from the sidebar.</SkyCardReact>
    </AdminPage>
  );
}

export function Deals() {
  return (
    <AdminPage title="Deals" subtitle="Admin only — upload and manage massage deals.">
      <SkyCardReact>Deal upload tools go here.</SkyCardReact>
    </AdminPage>
  );
}

export function Promotions() {
  return (
    <AdminPage
      title="Promotions"
      subtitle="Marketing only — create and schedule promotions."
    >
      <SkyCardReact>Promotion builder goes here.</SkyCardReact>
    </AdminPage>
  );
}

export function Sales() {
  return (
    <AdminPage title="Sales" subtitle="Sales only — track revenue and conversions.">
      <SkyCardReact>Sales dashboards go here.</SkyCardReact>
    </AdminPage>
  );
}
