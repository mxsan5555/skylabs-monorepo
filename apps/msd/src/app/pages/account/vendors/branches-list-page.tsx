import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilledButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { listBranches, setBranchStatus, type Branch } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useConfirmDialog } from '../../../components/confirm-dialog';

interface BranchesListPageProps {
  token: string | null;
  vendorId: string;
  /** Gates "Add branch" and each row's Edit/Toggle-status action — same coarse `vendors:edit`
   *  prop `DealsListPage`/`TherapistsListPage`/`ProductsListPage` already take. */
  canEdit: boolean;
}

const BRANCH_COLUMNS = JSON.stringify([
  { key: 'Name', label: 'Name' },
  { key: 'Location', label: 'Location' },
  { key: 'Deals', label: 'Deals' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } },
]);

function toRow(branch: Branch): Record<string, string | number> {
  const location = branch.state ? `${branch.state}${branch.city ? `, ${branch.city}` : ''}` : 'No location set';
  const deals = branch._count?.deals ?? 0;
  return {
    Name: branch.name,
    Location: location,
    Deals: deals > 0 ? `${deals} deal${deals === 1 ? '' : 's'}` : 'No deals yet',
    Status: branch.isActive ? 'Active' : 'Inactive',
  };
}

/** Branches — data table, same presentation as Deals/Therapists/Products. Plugged into
 *  `VendorDetailPage`'s `section="branches"`. Add/Edit are full pages (`/branches/new`,
 *  `/branches/:branchId`), never a popup; branches have no hard delete (they cascade to
 *  deals/therapists/orders), so the only destructive-adjacent action is the status toggle,
 *  confirmed on deactivate the same way as every other destructive action in this console. */
export function BranchesListPage({ token, vendorId, canEdit }: BranchesListPageProps) {
  const navigate = useNavigate();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const tableRef = useRef<HTMLElement>(null);

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

  const actions = canEdit ? [{ icon: 'edit', label: 'Edit', event: 'edit' }, { icon: 'toggle_on', label: 'Activate / Deactivate', event: 'toggle-status' }] : [];

  useEffect(() => {
    const el = tableRef.current;
    if (!el || actions.length === 0) return;
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; rowIndex: number }>).detail;
      const branch = branches[detail.rowIndex];
      if (!branch) return;
      if (detail.action === 'edit') navigate(`/account/vendors/${vendorId}/branches/${branch.id}`);
      else if (detail.action === 'toggle-status') toggleStatus(branch);
    };
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => el.removeEventListener('sky-dt-row-action', onRowAction);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- actions/toggleStatus are recreated each render; rowIndex lookup always reads the latest `branches` via closure
  }, [branches, vendorId, navigate]);

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
        <p className="empty-state">No branches yet. Add one to unlock deals and therapists.</p>
      ) : (
        <sky-data-table
          ref={tableRef as RefObject<HTMLElement>}
          caption="Branches"
          columns={BRANCH_COLUMNS}
          rows={JSON.stringify(branches.map(toRow))}
          total={branches.length}
          page={1}
          page-size={Math.max(branches.length, 10)}
          loading={loading}
          actions={actions.length > 0 ? JSON.stringify(actions) : undefined}
        />
      )}
      {ConfirmDialog}
    </div>
  );
}

export default BranchesListPage;
