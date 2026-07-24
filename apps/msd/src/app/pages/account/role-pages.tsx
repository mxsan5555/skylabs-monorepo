import { SkyCardReact } from '@skylabs-monorepo/shared-ui/react';
import { AdminPage } from '../../admin/admin-page';

/** Dashboard is for everyone — a landing page after sign-in. Deals/Promotions/Sales/
 *  Bookings moved to their own real pages (see pages/account/deals, /promotions, /sales, /bookings). */
export function Dashboard() {
  return (
    <AdminPage title="Dashboard" subtitle="An overview of your account activity.">
      <SkyCardReact>Welcome back. Pick a section from the sidebar.</SkyCardReact>
    </AdminPage>
  );
}
