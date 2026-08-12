import { AdminPage } from '../../admin/admin-page';
import { ProfileForm } from './profile-form';

/**
 * My Account (admin console): edit email/phone and manage saved addresses (full CRUD).
 * Thin wrapper only — the actual form lives in `ProfileForm`, shared with the storefront's
 * `/my-account` page so staff/vendor users here and customers there never duplicate the logic.
 */
export function Profile() {
  return (
    <AdminPage
      title="My Account"
      subtitle="Manage your contact details and saved addresses."
    >
      <ProfileForm />
    </AdminPage>
  );
}

export default Profile;
