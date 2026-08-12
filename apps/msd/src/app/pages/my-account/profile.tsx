import { AdminPage } from '../../admin/admin-page';
import { ProfileForm } from '../account/profile-form';

/**
 * `/my-account` — the storefront-facing equivalent of the admin console's `/account/profile`.
 * Same thin-wrapper pattern: `AdminPage` here is just its title/subtitle card container (it
 * has no dependency on `AdminLayout`/`Sidebar`), and `ProfileForm` is the exact same shared
 * component the admin-console page renders — no logic duplicated.
 */
export function MyAccountProfile() {
  return (
    <AdminPage
      title="My Account"
      subtitle="Manage your contact details and saved addresses."
    >
      <ProfileForm />
    </AdminPage>
  );
}

export default MyAccountProfile;
