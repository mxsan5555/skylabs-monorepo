import { useState } from 'react';
import { OutlinedButton } from '@skylabs-monorepo/shared-ui/react';
import {
  createBranch,
  setBranchStatus,
  updateBranch,
  type Branch,
  type BranchInput,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { BranchDialog, groupBranchesByState } from './vendor-branches';

interface VendorBranchListStepProps {
  token: string | null;
  vendorId: string;
  canEdit: boolean;
  branches: Branch[];
  onBranchesChange: (branches: Branch[]) => void;
}

/**
 * Onboarding wizard Step 2's branch-only half (Business Modules + Category Access render
 * alongside it, via `VendorModulesAndCategoryAccess`) — deliberately just the branch list, not
 * `VendorBranches`'s full two-pane Branches+Deals layout, since Deals become their own Step 3 in
 * the wizard. Reuses `BranchDialog` verbatim (including its State/City + operating-hours
 * fields), same as `VendorBranches` does, so there is exactly one Branch create/edit form in the
 * app. Always admin-scoped (`createBranch`/`updateBranch`/`setBranchStatus`'s `/vendors/:id/...`
 * routes) — the wizard is only ever used by an admin managing a vendor's onboarding.
 */
export function VendorBranchListStep({ token, vendorId, canEdit, branches, onBranchesChange }: VendorBranchListStepProps) {
  const [error, setError] = useState('');

  const saveBranch = async (input: BranchInput, existing?: Branch) => {
    if (existing) {
      const { data } = await updateBranch(token, vendorId, existing.id, input);
      onBranchesChange(branches.map((b) => (b.id === data.id ? data : b)));
    } else {
      const { data } = await createBranch(token, vendorId, input);
      onBranchesChange([data, ...branches]);
    }
  };

  const toggleStatus = async (branch: Branch) => {
    setError('');
    try {
      const { data } = await setBranchStatus(token, vendorId, branch.id, !branch.isActive);
      onBranchesChange(branches.map((b) => (b.id === data.id ? data : b)));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change branch status.');
    }
  };

  const stateGroups = groupBranchesByState(branches);

  return (
    <section aria-label="Branches">
      <div className="page-head">
        <h3 className="section-title">Branches</h3>
        {canEdit && <BranchDialog onSave={(input) => saveBranch(input).then(() => setError(''))} />}
      </div>
      {error && <p className="error-state" role="alert">{error}</p>}
      {branches.length === 0 ? (
        <p className="empty-state">No branches yet — add at least one branch (with a state) before this vendor can be submitted.</p>
      ) : (
        <>
          <p className="field-hint">
            {branches.length} branch{branches.length === 1 ? '' : 'es'} across {stateGroups.length} state{stateGroups.length === 1 ? '' : 's'}.
          </p>
          <ul className="entity-list">
            {branches.map((branch) => (
              <li key={branch.id}>
                <div className="entity-list__item">
                  <span className="role-list__name">
                    {branch.name}
                    {branch.state && <span className="field-hint"> · {branch.state}{branch.city ? `, ${branch.city}` : ''}</span>}
                  </span>
                  <span className={`status-pill ${branch.isActive ? 'status-pill--active' : 'status-pill--inactive'}`}>
                    {branch.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {canEdit && (
                  <div className="page-head__actions">
                    <BranchDialog branch={branch} onSave={(input) => saveBranch(input, branch)} />
                    <OutlinedButton onClick={() => toggleStatus(branch)}>
                      {branch.isActive ? 'Deactivate' : 'Activate'}
                    </OutlinedButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export default VendorBranchListStep;
