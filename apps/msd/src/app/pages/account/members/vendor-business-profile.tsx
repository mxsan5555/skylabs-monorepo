import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { VendorProfileForm } from './vendor-profile-form';
import { VendorProfileTabs } from './vendor-profile-tabs';
import { useMyVendor } from './vendors';

/**
 * Split-out half of the old combined "My Business" page: just the Business/Owner/Address/
 * KYC/Bank/Profile-Image profile editor, on its own route/nav item ("Business Profile"). Reuses
 * `useMyVendor` (the same fetch/save/submit implementation the combined page and "Branches &
 * Deals" share) and the shared `VendorProfileTabs` (Business/Owner/Address/KYC/Bank/Profile
 * Image tabs) — the same tabbed editor the admin `VendorPipeline` uses, once the vendor row
 * exists. Does NOT reuse `VendorPipeline` itself: that component hardcodes the *admin*
 * `POST /vendors` / `PATCH /vendors/:id` calls (gated server-side by `vendors:create`/
 * `vendors:edit`), plus an admin-only "Vendor User" picker step. The `vendor` role only ever
 * holds `vendors:custom` (see `vendors.tsx`'s SuperAdmin note — a role never gets a permission
 * wider than it needs), so wiring this self-service page to `VendorPipeline` would 403 on every
 * save — `useMyVendor.save`/`submit` route through the correct `/vendors/me*` surface instead.
 *
 * Before the vendor row exists at all (`notFound`), there's nothing to tab between yet — a
 * self-service vendor's very first save (`businessName` required) is what creates the row, so
 * that first save renders as a single plain `VendorProfileForm` (all sections, matching its
 * own "create vendor" default) rather than a tab bar with only one working tab.
 */
export function VendorBusinessProfile() {
  const { token } = useAuth();
  const { vendor, notFound, loading, saving, message, error, save, submit, fieldErrors } = useMyVendor(token);

  if (loading) {
    return (
      <div className="admin-page">
        <p className="loading-state">Loading your business profile…</p>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page--wide">
      <title>Business Profile · MSD</title>
      <header className="page-head">
        <div>
          <h1>Business Profile</h1>
          <p>{notFound ? 'Complete your business profile to get started.' : `Status: ${vendor?.status}`}</p>
        </div>
      </header>

      {message && <p className="field-hint" role="status">{message}</p>}
      {error && <p className="error-state" role="alert">{error}</p>}

      {vendor ? (
        <VendorProfileTabs
          vendor={vendor}
          token={token}
          selfService
          canEdit
          saving={saving}
          onSave={save}
          onSubmitForVerification={submit}
          serverFieldErrors={fieldErrors}
        />
      ) : (
        <VendorProfileForm
          vendor={null}
          canEdit
          canReviewKyc={false}
          saving={saving}
          token={token}
          selfService
          sections={['business', 'owner', 'address', 'kyc', 'bank']}
          onSave={save}
          serverFieldErrors={fieldErrors}
        />
      )}
    </div>
  );
}

export default VendorBusinessProfile;
