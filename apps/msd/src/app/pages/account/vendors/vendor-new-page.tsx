import { useState } from 'react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { useNavigate } from 'react-router-dom';
import { FilledButton } from '@skylabs-monorepo/shared-ui/react';
import type { Vendor } from '../../../../api/rbac/vendors';
import { VendorPipeline } from './vendor-pipeline';

/**
 * The dedicated "Add New Vendor" page (`/account/vendors/new`) — previously this was a
 * numbered-step-pill wizard rendered inline on `/account/vendors` itself (a `creating` boolean
 * conditionally swapping out the list). A dedicated route is simpler to reason about (its own
 * back-button/bookmark behavior, no "am I creating or viewing?" branch inside the list page) and
 * matches this app's own convention of giving a distinct admin action its own route rather than
 * a modal. Renders the exact same `VendorPipeline` the vendor detail page's "Overview" tab uses
 * — no new form/save logic, only a dedicated place to land on before one exists.
 *
 * Deliberately does NOT navigate away the instant the vendor row is created (`VendorPipeline`'s
 * `onVendorChange` fires after *every* save, including each individual tab) — that would yank
 * the admin back to the list before they get to touch Business/Owner/Address/KYC/Bank/Profile
 * Image at all. Instead this just tracks the created vendor locally and shows a "Done" action
 * once it exists, so the admin decides when they're finished filling in tabs.
 */
export function VendorNewPage() {
  const { token, can } = useAuth();
  const navigate = useNavigate();
  const canCreate = can('vendors', 'create');
  const [vendor, setVendor] = useState<Vendor | null>(null);

  if (!canCreate) {
    return <p className="empty-state">You do not have access to add a vendor.</p>;
  }

  return (
    <div className="admin-page admin-page--wide">
      <title>Add Vendor · MSD</title>
      <header className="page-head">
        <div>
          <h1>Add New Vendor</h1>
          <p>Create the vendor's login, then fill in their business profile.</p>
        </div>
        {vendor && (
          <div className="page-head__actions">
            <FilledButton onClick={() => navigate(`/account/vendors?vendorId=${vendor.id}`)}>
              Done — View Vendor
            </FilledButton>
          </div>
        )}
      </header>

      <VendorPipeline token={token} initialVendor={vendor} onVendorChange={setVendor} />
    </div>
  );
}

export default VendorNewPage;
