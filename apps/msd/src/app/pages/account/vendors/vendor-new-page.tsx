import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { useNavigate } from 'react-router-dom';
import type { Vendor } from '../../../../api/rbac/vendors';
import { useSetBreadcrumbs } from '../../../admin/breadcrumb-context';
import { VendorOwnerLoginStep } from './vendor-user-picker';

/**
 * The dedicated "Add Member" page (`/account/vendors/new`) — Step 1 of 4 (Owner & Login) only.
 * Once the login/Member record is created, this immediately opens the existing Member Details
 * page (`/account/vendors/:id`) so the admin sees the real (incomplete) setup status and a
 * "Complete Profile" next action there — Steps 2-4 (Business Details, KYC Documents, Branch &
 * Access) continue from that page, not from here.
 */
export function VendorNewPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const canCreate = can('vendors', 'create');

  useSetBreadcrumbs([{ label: 'Members' }, { label: 'All Member', to: '/account/vendors' }, { label: 'Add member' }]);

  if (!canCreate) {
    return <p className="empty-state">You do not have access to add a vendor.</p>;
  }

  return (
    <div className="admin-page admin-page--wide">
      <title>Add Member · MSD</title>
      <header className="page-head">
        <div>
          <h1>Add New Member</h1>
          <p>Create the member's owner login, then continue their setup from their own page.</p>
        </div>
      </header>

      <VendorOwnerLoginStep onCreated={(vendor: Vendor) => navigate(`/account/vendors/${vendor.id}`, { replace: true })} />
    </div>
  );
}

export default VendorNewPage;
