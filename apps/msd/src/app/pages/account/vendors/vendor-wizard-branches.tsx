import { useNavigate } from 'react-router-dom';
import { Icon, OutlinedButton } from '@skylabs-monorepo/shared-ui/react';
import type { Branch } from '../../../../api/rbac/vendors';
import { groupBranchesByState } from './vendor-branches';

interface VendorBranchListStepProps {
  vendorId: string;
  branches: Branch[];
}

/**
 * Onboarding wizard Step 2's branch-only half (Product Categories renders alongside it, via
 * `VendorProductCategoryAccess`) — a read-only recap + a "Manage branches" link out to
 * `BranchesListPage`/`BranchFormPage` (`/account/vendors/:id/branches`), which now own every
 * branch add/edit/status change for admin use. This step used to run its own `BranchDialog`
 * popup CRUD inline — removed because it duplicated that same job in a second place (the exact
 * "same data edited in two places" problem the 2026-09-28 branch-management spec warned against
 * repeating); see the 2026-10-05 wizard-cleanup note for the full rationale.
 */
export function VendorBranchListStep({ vendorId, branches }: VendorBranchListStepProps) {
  const navigate = useNavigate();
  const stateGroups = groupBranchesByState(branches);

  return (
    <section aria-label="Branches">
      <div className="page-head">
        <h3 className="section-title">Branches</h3>
        <OutlinedButton onClick={() => navigate(`/account/vendors/${vendorId}/branches`)}>
          <Icon slot="icon" aria-hidden="true">open_in_new</Icon>
          Manage branches
        </OutlinedButton>
      </div>
      {branches.length === 0 ? (
        <p className="empty-state">No branches yet — add at least one branch (with a state) before this vendor can be submitted.</p>
      ) : (
        <>
          <p className="field-hint">
            {branches.length} branch{branches.length === 1 ? '' : 'es'} across {stateGroups.length} state{stateGroups.length === 1 ? '' : 's'}.
          </p>
          <ul className="entity-list">
            {branches.map((branch) => (
              <li key={branch.id} className="entity-list__item">
                <span className="role-list__name">
                  {branch.name}
                  {branch.state && <span className="field-hint"> · {branch.state}{branch.city ? `, ${branch.city}` : ''}</span>}
                </span>
                <span className={`status-pill ${branch.isActive ? 'status-pill--active' : 'status-pill--inactive'}`}>
                  {branch.isActive ? 'Active' : 'Inactive'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export default VendorBranchListStep;
