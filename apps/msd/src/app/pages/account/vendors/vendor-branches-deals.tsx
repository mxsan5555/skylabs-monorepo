import { useEffect, useState } from 'react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listCategories, type Category } from '../../../../api/rbac/vendors';
import { VendorBranches } from './vendor-branches';
import { useMyVendor } from './vendors';

/**
 * Split-out half of the old combined "My Business" page: just the Branches/Deals two-pane,
 * on its own route/nav item ("Branches & Deals"). Reuses `useMyVendor` (same fetch as the
 * combined page and "Business Profile") for the vendor id + status gate, and `VendorBranches`
 * exactly as-is — no changes to either. Branches/deals only make sense once the vendor is
 * `ACTIVE`, same gate the combined page already applied.
 */
export function VendorBranchesDeals() {
  const { token } = useAuth();
  const { vendor, loading, error } = useMyVendor(token);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    listCategories(token).then(({ data }) => setCategories(data)).catch(() => setCategories([]));
  }, [token]);

  if (loading) {
    return (
      <div className="admin-page">
        <p className="loading-state">Loading your branches…</p>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page--wide">
      <title>Branches &amp; Deals · MSD</title>
      <header className="page-head">
        <div>
          <h1>Branches &amp; Deals</h1>
          <p>Manage your business's branches and the deals published under each.</p>
        </div>
      </header>

      {error && <p className="error-state" role="alert">{error}</p>}

      {!vendor || vendor.status !== 'ACTIVE' ? (
        <p className="empty-state">
          Your business profile must be approved and active before you can manage branches and deals.
        </p>
      ) : (
        <VendorBranches token={token} vendorId={vendor.id} isSelf canEdit canApproveDeal={false} categories={categories} />
      )}
    </div>
  );
}

export default VendorBranchesDeals;
