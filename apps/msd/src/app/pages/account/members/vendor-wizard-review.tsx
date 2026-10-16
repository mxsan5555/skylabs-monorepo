import { FilledButton, OutlinedButton } from '@skylabs-monorepo/shared-ui/react';
import type { AdminTherapist, Branch, Vendor, VendorCategoryAccessRow, VendorProduct } from '../../../../api/rbac/vendors';
import { groupBranchesByState } from './vendor-branches';

interface ChecklistItem {
  label: string;
  met: boolean;
}

/** Mirrors msd-api's `hasMinimumKycDocument` in `vendor.service.ts#submitForVerification`
 *  exactly — same "GST, PAN, or Aadhaar" type match — so this read-only recap never disagrees
 *  with what the backend will actually accept. */
function hasMinimumKycDocument(vendor: Vendor): boolean {
  return (vendor.kycDocuments ?? []).some((doc) => /gst|pan|aadhaar/i.test(doc.type) && Boolean(doc.url));
}

interface VendorReviewStepProps {
  vendor: Vendor;
  branches: Branch[];
  categoryAccess: VendorCategoryAccessRow[];
  dealCount: number;
  therapists: AdminTherapist[];
  products: VendorProduct[];
  /** Reuses the page-level Approve/Reject actions `AdminVendorManagement` already has (there is
   *  no admin-equivalent of the self-service `submitForVerification` route — see this
   *  component's own doc comment) — omitted entirely (no button rendered) when the caller
   *  doesn't hold the corresponding permission, same as everywhere else in this app. */
  canApprove?: boolean;
  canReject?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}

/**
 * Onboarding wizard Step 6 — read-only recap of every earlier step, reusing already-fetched
 * data (no new fetches), plus the completeness checklist that extends msd-api's
 * `submitForVerification` gate (branches/states, business modules, granted categories) to
 * decide whether this vendor is ready.
 *
 * There is no admin-on-behalf equivalent of the self-service `POST /vendors/me/submit` route
 * (it always resolves the vendor from the caller's own JWT) — and an admin can already directly
 * Approve/Reject a vendor at ANY status (see `vendor.service.ts#approveVendor`, no status
 * precondition), which is what `AdminVendorManagement`'s page header already offers. So rather
 * than call a self-service route that would 403 for an admin working someone else's vendor,
 * this step's "Submit for Approval" concept is realized as the same Approve/Reject actions,
 * gated client-side on the checklist below being fully met.
 */
export function VendorReviewStep({
  vendor,
  branches,
  categoryAccess,
  dealCount,
  therapists,
  products,
  canApprove,
  canReject,
  onApprove,
  onReject,
}: VendorReviewStepProps) {
  const stateGroups = groupBranchesByState(branches);
  const grantedTypes = new Set(categoryAccess.map((a) => a.category.type));
  const enabledModules = [vendor.offersService && 'Service', vendor.offersProduct && 'Product', vendor.offersTherapy && 'Therapy'].filter(
    Boolean,
  ) as string[];

  const checklist: ChecklistItem[] = [
    {
      label: 'Business name, email, address, GST and PAN filled in',
      met: Boolean(vendor.businessName && vendor.businessEmail && vendor.address && vendor.gstNumber && vendor.panNumber),
    },
    { label: 'At least one KYC document uploaded (GST, PAN, or Aadhaar)', met: hasMinimumKycDocument(vendor) },
    { label: 'At least one branch with a state set', met: branches.some((b) => Boolean(b.state)) },
    { label: 'At least one business module enabled', met: enabledModules.length > 0 },
    ...(vendor.offersService ? [{ label: 'At least one granted Service category', met: grantedTypes.has('SERVICE') }] : []),
    ...(vendor.offersProduct ? [{ label: 'At least one granted Product category', met: grantedTypes.has('PRODUCT') }] : []),
    ...(vendor.offersTherapy ? [{ label: 'At least one granted Therapy category', met: grantedTypes.has('THERAPY') }] : []),
  ];
  const ready = checklist.every((c) => c.met);

  return (
    <section aria-label="Review and submit">
      <h3 className="section-title">Summary</h3>
      <dl className="form-grid">
        <div>
          <dt className="field-hint">Business</dt>
          <dd>{vendor.businessName ?? '—'}</dd>
        </div>
        <div>
          <dt className="field-hint">Owner</dt>
          <dd>{vendor.owner?.name ?? '—'}</dd>
        </div>
        <div>
          <dt className="field-hint">Status</dt>
          <dd className={`status-pill ${vendor.status === 'ACTIVE' ? 'status-pill--active' : 'status-pill--inactive'}`}>{vendor.status}</dd>
        </div>
        <div>
          <dt className="field-hint">KYC status</dt>
          <dd>{vendor.kycStatus}</dd>
        </div>
        <div>
          <dt className="field-hint">Business modules</dt>
          <dd>{enabledModules.join(', ') || '—'}</dd>
        </div>
        <div>
          <dt className="field-hint">Branches</dt>
          <dd>
            {branches.length} across {stateGroups.length} state{stateGroups.length === 1 ? '' : 's'}
          </dd>
        </div>
        <div>
          <dt className="field-hint">Deals</dt>
          <dd>{dealCount}</dd>
        </div>
        <div>
          <dt className="field-hint">Therapists</dt>
          <dd>{therapists.length}</dd>
        </div>
        <div>
          <dt className="field-hint">Products</dt>
          <dd>{products.length}</dd>
        </div>
      </dl>

      <h3 className="section-title">Submission checklist</h3>
      <ul className="entity-list">
        {checklist.map((item) => (
          <li key={item.label} className="entity-list__item">
            <span className={`status-pill ${item.met ? 'status-pill--active' : 'status-pill--inactive'}`}>{item.met ? 'Done' : 'Missing'}</span>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>

      {canApprove || canReject ? (
        <div className="form-actions">
          {canApprove && (
            <FilledButton onClick={onApprove} disabled={!ready}>
              Approve vendor
            </FilledButton>
          )}
          {canReject && <OutlinedButton onClick={onReject}>Reject vendor</OutlinedButton>}
        </div>
      ) : (
        <p className="field-hint">
          {ready ? 'This vendor is ready for approval.' : 'Complete the missing items above before this vendor can be approved.'}
        </p>
      )}
    </section>
  );
}

export default VendorReviewStep;
