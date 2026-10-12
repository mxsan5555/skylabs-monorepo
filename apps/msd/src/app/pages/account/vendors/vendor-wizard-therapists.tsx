import { useNavigate } from 'react-router-dom';
import { Icon, OutlinedButton } from '@skylabs-monorepo/shared-ui/react';
import type { Branch } from '../../../../api/rbac/vendors';

interface VendorTherapistsStepProps {
  vendorId: string;
  offersTherapy: boolean;
  /** This vendor's branches (from Step 2) — only used to check whether any of them currently
   *  has Therapy category access (`categoryTypes`, computed server-side by `listBranches`), same
   *  eligibility gate the old inline form used. */
  branches: Branch[];
  therapistCount: number;
}

/**
 * Onboarding wizard Step 4 — a read-only recap + a "Manage therapists" link out to
 * `TherapistsListPage`/`TherapistFormPage` (`/account/vendors/:id/therapists`), which now own
 * every therapist add/edit/status change for admin use. This step used to run its own
 * `WizardTherapistFormDialog` popup CRUD inline — removed because it duplicated that same job in
 * a second place; see `vendor-wizard-branches.tsx`'s own doc comment for the full rationale.
 */
export function VendorTherapistsStep({ vendorId, offersTherapy, branches, therapistCount }: VendorTherapistsStepProps) {
  const navigate = useNavigate();
  // `vendor.offersTherapy` is a denormalized convenience flag, not the ground truth — real
  // category grants are (see the original `VendorTherapistsStep`'s own doc comment on why any
  // real THERAPY branch access is sufficient to proceed, regardless of what the flag says).
  const therapyBranches = branches.filter((b) => b.categoryTypes?.includes('THERAPY'));

  if (!offersTherapy && therapyBranches.length === 0) {
    return <p className="empty-state">This vendor has not enabled the Therapy business module in Step 2.</p>;
  }

  return (
    <section aria-label="Therapy">
      <div className="page-head">
        <h3 className="section-title">Therapists</h3>
        <OutlinedButton onClick={() => navigate(`/account/vendors/${vendorId}/therapists`)}>
          <Icon slot="icon" aria-hidden="true">open_in_new</Icon>
          Manage therapists
        </OutlinedButton>
      </div>
      {branches.length === 0 ? (
        <p className="empty-state">Add a branch in Step 2 before adding therapists.</p>
      ) : therapyBranches.length === 0 ? (
        <p className="empty-state">No branch currently has Therapy category access — map one under Business Modules &amp; Category Access first.</p>
      ) : (
        <p className="field-hint">{therapistCount} therapist{therapistCount === 1 ? '' : 's'} across this vendor's branches.</p>
      )}
    </section>
  );
}

export default VendorTherapistsStep;
