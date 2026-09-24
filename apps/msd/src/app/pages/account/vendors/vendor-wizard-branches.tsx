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
  /**
   * Forwarded to every `BranchDialog` instance's `onCategoryAccessSaved` — fired after a branch's
   * category-access save (which can flip `Vendor.offersService`/`offersTherapy` server-side)
   * actually completes, NOT bundled into `onBranchesChange` above (that fires right after the
   * branch-FIELDS save, which happens first and is a separate, earlier network call — see
   * `BranchDialog`'s own doc comment for why conflating the two is a real race that can refetch
   * the vendor before the category grant has even landed).
   */
  onVendorRefresh?: () => void;
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
  onVendorRefresh,
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
            onCategoryAccessSaved={onVendorRefresh}
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
                onVendorRefresh={onVendorRefresh}
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
  onVendorRefresh?: () => void;
}

/**
 * One branch's list row — its own component (rather than an inline `.map()` callback) purely so
 * it can own a per-branch `branchDialogRef`: `useRef` can't be called from inside a `.map()`
 * callback (rules-of-hooks), and each branch needs its own `BranchDialog` instance/ref so opening
 * one branch's dialog can never affect another's.
 *
 * A single "Edit" trigger opens `BranchDialog`, which now covers both the branch fields AND its
 * own Categories & Subcategories section in one form (folded in from a separate dialog a while
 * back) — this used to render a second "Categories" button that opened the exact same dialog
 * instance via the same `dialogRef.current?.show()` call, a leftover duplicate from before that
 * merge that did nothing a single button didn't already do; removed.
 */
function BranchRow({
  branch,
  canEdit,
  token,
  vendorId,
  onSaveBranch,
  onToggleStatus,
  onVendorRefresh,
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
          onCategoryAccessSaved={onVendorRefresh}
          dialogRef={branchDialogRef}
          hideTrigger
        />
      )}
    </li>
  );
}

export default VendorBranchListStep;
