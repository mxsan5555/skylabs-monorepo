import { useNavigate } from 'react-router-dom';
import { Icon, OutlinedButton } from '@skylabs-monorepo/shared-ui/react';

interface VendorDealsStepProps {
  vendorId: string;
  branchCount: number;
  dealCount: number;
}

/**
 * Onboarding wizard Step 3 — a read-only recap + a "Manage deals" link out to
 * `DealsListPage`/`DealFormPage` (`/account/vendors/:id/deals`), which now own every deal
 * add/edit/status change (and therapist linking) for admin use. This step used to run its own
 * `DealDialog` popup CRUD inline — removed because it duplicated that same job in a second
 * place; see `vendor-wizard-branches.tsx`'s own doc comment for the full rationale.
 */
export function VendorDealsStep({ vendorId, branchCount, dealCount }: VendorDealsStepProps) {
  const navigate = useNavigate();

  return (
    <section aria-label="Deals">
      <div className="page-head">
        <h3 className="section-title">Deals</h3>
        <OutlinedButton onClick={() => navigate(`/account/vendors/${vendorId}/deals`)}>
          <Icon slot="icon" aria-hidden="true">open_in_new</Icon>
          Manage deals
        </OutlinedButton>
      </div>
      {branchCount === 0 ? (
        <p className="empty-state">Add a branch in Step 2 before adding deals.</p>
      ) : (
        <p className="field-hint">{dealCount} deal{dealCount === 1 ? '' : 's'} across this vendor's branches.</p>
      )}
    </section>
  );
}

export default VendorDealsStep;
