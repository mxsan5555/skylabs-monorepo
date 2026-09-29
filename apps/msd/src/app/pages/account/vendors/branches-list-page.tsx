import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilledButton, OutlinedButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { listBranches, setBranchStatus, type Branch } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { CardGrid } from '../../../components/card-grid/card-grid';
import { useConfirmDialog } from '../../../components/confirm-dialog';

interface BranchesListPageProps {
  token: string | null;
  vendorId: string;
  /** Gates "Add branch" and each card's Edit/Deactivate actions — matches `vendors:edit`,
   *  passed down from `VendorDetailPage` the same way it already was to the old `VendorBranches`. */
  canEdit: boolean;
}

/** One branch's location + status + deal count, one line (no separate fields to scan). */
function branchSummary(branch: Branch): string {
  const location = branch.state ? `${branch.state}${branch.city ? `, ${branch.city}` : ''}` : 'No location set';
  const status = branch.isActive ? 'Active' : 'Inactive';
  const deals = branch._count?.deals ?? 0;
  // PLAN 2: once /branches/:branchId/deals exists, this becomes a link instead of plain text,
  // and a Therapists count is added back once Plan 3 decides how to source it without an
  // all-vendor therapist fetch (see this plan's "Two disclosed adjustments" note).
  const dealsText = deals > 0 ? `${deals} deal${deals === 1 ? '' : 's'}` : 'No deals yet';
  return `${location} · ${status} · ${dealsText}`;
}

/** Branches — card grid. Plugged into `VendorDetailPage`'s `section="branches"`.
 *  Add/Edit are full pages (`/branches/new`, `/branches/:branchId`), never a popup; branches
 *  have no hard delete (they cascade to deals/therapists/orders), so the only destructive action
 *  is Deactivate, confirmed the same way as every other destructive action in this console. */
export function BranchesListPage({ token, vendorId, canEdit }: BranchesListPageProps) {
  const navigate = useNavigate();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await listBranches(token, vendorId);
      setBranches(data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load branches.');
    } finally {
      setLoading(false);
    }
  }, [token, vendorId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleStatus = async (branch: Branch) => {
    if (branch.isActive && !(await confirm(`Deactivate "${branch.name}"? It stops taking new bookings until reactivated.`))) return;
    try {
      await setBranchStatus(token, vendorId, branch.id, !branch.isActive);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not update this branch.');
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h2 className="section-title">Branches</h2>
          <p className="field-hint">{loading ? 'Loading…' : `${branches.length} branch${branches.length === 1 ? '' : 'es'}`}</p>
        </div>
        {canEdit && (
          <div className="page-head__actions">
            <FilledButton onClick={() => navigate(`/account/vendors/${vendorId}/branches/new`)}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              Add branch
            </FilledButton>
          </div>
        )}
      </div>

      {error && <p className="error-state" role="alert">{error}</p>}

      {!loading && branches.length === 0 ? (
        <p className="empty-state">No branches yet. Add one to unlock deals, therapists and products.</p>
      ) : (
        <CardGrid layout="compact">
          {branches.map((branch) => (
            <sky-feature-card key={branch.id} color="none" variant="outlined" headline={branch.name} text={branchSummary(branch)}>
              {canEdit && (
                <>
                  <OutlinedButton
                    slot="actions"
                    aria-label={`Edit ${branch.name}`}
                    onClick={() => navigate(`/account/vendors/${vendorId}/branches/${branch.id}`)}
                  >
                    Edit
                  </OutlinedButton>
                  <OutlinedButton
                    slot="actions"
                    aria-label={`${branch.isActive ? 'Deactivate' : 'Activate'} ${branch.name}`}
                    onClick={() => toggleStatus(branch)}
                  >
                    {branch.isActive ? 'Deactivate' : 'Activate'}
                  </OutlinedButton>
                </>
              )}
            </sky-feature-card>
          ))}
        </CardGrid>
      )}
      {ConfirmDialog}
    </div>
  );
}

export default BranchesListPage;
