import { useRef, useState } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { Icon, OutlinedButton } from '@skylabs-monorepo/shared-ui/react';
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
 * Onboarding wizard Step 2's branch-only half (Product Categories renders alongside it, via
 * `VendorProductCategoryAccess`) — deliberately just the branch list, not `VendorBranches`'s full
 * two-pane Branches+Deals layout, since Deals become their own Step 3 in the wizard. Reuses
 * `BranchDialog` verbatim (branch fields, operating hours, AND its own Service/Therapy Categories
 * & Subcategories section — see that component's own doc comment), same as `VendorBranches` does,
 * so there is exactly one Branch create/edit form in the app. Always admin-scoped
 * (`createBranch`/`updateBranch`/`setBranchStatus`'s `/vendors/:id/...` routes) — the wizard is
 * only ever used by an admin managing a vendor's onboarding.
 */
export function VendorBranchListStep({
  token,
  vendorId,
  canEdit,
  branches,
  onBranchesChange,
}: VendorBranchListStepProps) {
  const [error, setError] = useState('');

  const saveBranch = async (input: BranchInput, existing?: Branch): Promise<Branch> => {
    if (existing) {
      const { data } = await updateBranch(token, vendorId, existing.id, input);
      onBranchesChange(branches.map((b) => (b.id === data.id ? data : b)));
      return data;
    }
    const { data } = await createBranch(token, vendorId, input);
    onBranchesChange([data, ...branches]);
    return data;
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
        {canEdit && (
          <BranchDialog
            token={token}
            vendorId={vendorId}
            onSave={(input) => saveBranch(input).then((data) => { setError(''); return data; })}
          />
        )}
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
              <BranchRow
                key={branch.id}
                branch={branch}
                canEdit={canEdit}
                token={token}
                vendorId={vendorId}
                onSaveBranch={(input) => saveBranch(input, branch)}
                onToggleStatus={() => toggleStatus(branch)}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

interface BranchRowProps {
  branch: Branch;
  canEdit: boolean;
  token: string | null;
  vendorId: string;
  onSaveBranch: (input: BranchInput) => Promise<Branch>;
  onToggleStatus: () => void;
}

/**
 * One branch's list row — its own component (rather than an inline `.map()` callback) purely so
 * it can own a per-branch `branchDialogRef`: `useRef` can't be called from inside a `.map()`
 * callback (rules-of-hooks), and each branch needs its own `BranchDialog` instance/ref so opening
 * one branch's dialog can never affect another's.
 *
 * "Edit" and "Categories" are two triggers for the exact same `BranchDialog` instance (branch
 * fields + its own Categories & Subcategories section are now one form, not two dialogs) —
 * `BranchDialog`'s own built-in trigger button is hidden (`hideTrigger`) so both buttons here
 * drive the same `dialogRef.current?.show()`.
 */
function BranchRow({
  branch,
  canEdit,
  token,
  vendorId,
  onSaveBranch,
  onToggleStatus,
}: BranchRowProps) {
  const branchDialogRef = useRef<MdDialog>(null);

  return (
    <li>
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
          <OutlinedButton onClick={() => branchDialogRef.current?.show()}>
            <Icon slot="icon" aria-hidden="true">edit</Icon>
            Edit
          </OutlinedButton>
          {/* <OutlinedButton onClick={() => branchDialogRef.current?.show()}>
            <Icon slot="icon" aria-hidden="true">category</Icon>
            Categories
          </OutlinedButton> */}
          <OutlinedButton onClick={onToggleStatus}>{branch.isActive ? 'Deactivate' : 'Activate'}</OutlinedButton>
        </div>
      )}
      {canEdit && (
        <BranchDialog
          branch={branch}
          token={token}
          vendorId={vendorId}
          onSave={onSaveBranch}
          dialogRef={branchDialogRef}
          hideTrigger
        />
      )}
    </li>
  );
}

export default VendorBranchListStep;
