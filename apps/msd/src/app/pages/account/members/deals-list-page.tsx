import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FilledButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { listBranches, listVendorDealsForAdmin, setDealStatus, deleteDeal, type AdminDeal } from '../../../../api/rbac/vendors';
import { fromPriceLabel } from './deal-format';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useConfirmDialog } from '../../../components/confirm-dialog';

interface DealsListPageProps {
  token: string | null;
  vendorId: string;
  /** `vendors.deals:edit`: Add deal, Edit and Activate / Deactivate (the API re-checks). */
  canEdit: boolean;
  /** `vendors.deals:delete`; the API also requires Super Admin (PLANNING §2.7). */
  canDelete: boolean;
}

const DEAL_COLUMNS = JSON.stringify([
  { key: 'Title', label: 'Deal' },
  { key: 'Branch', label: 'Branch' },
  { key: 'Category', label: 'Category' },
  { key: 'Price', label: 'Price' },
  { key: 'Therapists', label: 'Therapists' },
  {
    key: 'Status',
    label: 'Status',
    type: 'status',
    statusMap: { ACTIVE: 'success', DRAFT: 'warning', INACTIVE: 'error', EXPIRED: 'error' },
  },
]);

function toRow(d: AdminDeal): Record<string, string | number> {
  const therapistCount = d.therapists?.length ?? 0;
  return {
    Title: d.title,
    Branch: d.branch.name,
    Category: d.category?.name ?? '—',
    Price: fromPriceLabel(d),
    Therapists: therapistCount > 0 ? `${therapistCount} linked` : 'None linked',
    Status: d.status,
  };
}

/** Deals tab of the member page: every deal of the member, every branch. Add/Edit open the deal
 *  form (`/deals/new`, `/deals/:dealId`). With no branch yet it asks for one first (PLANNING §2.7);
 *  Delete is Super Admin only and 409s for a deal with orders. */
export function DealsListPage({ token, vendorId, canEdit, canDelete }: DealsListPageProps) {
  const navigate = useNavigate();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [deals, setDeals] = useState<AdminDeal[]>([]);
  const [branchCount, setBranchCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data }, branches] = await Promise.all([listVendorDealsForAdmin(token, vendorId), listBranches(token, vendorId)]);
      setDeals(data);
      setBranchCount(branches.data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load deals.');
    } finally {
      setLoading(false);
    }
  }, [token, vendorId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleStatus = async (deal: AdminDeal) => {
    setError('');
    try {
      const nextStatus = deal.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await setDealStatus(token, vendorId, deal.branchId, deal.id, nextStatus);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change this deal\'s status.');
    }
  };

  const remove = async (deal: AdminDeal) => {
    if (!(await confirm(`Delete "${deal.title}"? This cannot be undone.`))) return;
    try {
      await deleteDeal(token, vendorId, deal.branchId, deal.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete this deal.');
    }
  };

  const actions = [
    ...(canEdit ? [{ icon: 'edit', label: 'Edit', event: 'edit' }, { icon: 'toggle_on', label: 'Activate / Deactivate', event: 'toggle-status' }] : []),
    ...(canDelete ? [{ icon: 'delete', label: 'Delete', event: 'delete', variant: 'danger' }] : []),
  ];

  useEffect(() => {
    const el = tableRef.current;
    if (!el || actions.length === 0) return;
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; rowIndex: number }>).detail;
      const deal = deals[detail.rowIndex];
      if (!deal) return;
      if (detail.action === 'edit') navigate(`/account/members/${vendorId}/deals/${deal.id}`);
      else if (detail.action === 'toggle-status') toggleStatus(deal);
      else if (detail.action === 'delete') remove(deal);
    };
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => el.removeEventListener('sky-dt-row-action', onRowAction);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- actions/toggleStatus/remove are recreated each render; rowIndex lookup always reads the latest `deals` via closure
  }, [deals, vendorId, navigate]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2 className="section-title">Deals</h2>
          <p className="field-hint">{loading ? 'Loading…' : `${deals.length} deal${deals.length === 1 ? '' : 's'}`}</p>
        </div>
        {canEdit && branchCount !== 0 && (
          <div className="page-head__actions">
            <FilledButton onClick={() => navigate(`/account/members/${vendorId}/deals/new`)}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              Add deal
            </FilledButton>
          </div>
        )}
      </div>

      {error && <p className="error-state" role="alert">{error}</p>}

      {!loading && branchCount === 0 ? (
        <p className="empty-state">
          Add a branch first: a deal is sold at one branch. <Link to={`/account/members/${vendorId}/branches/new`}>Add a branch</Link>
        </p>
      ) : !loading && deals.length === 0 ? (
        <p className="empty-state">No deals yet. Add one for a branch.</p>
      ) : (
        <sky-data-table
          ref={tableRef as RefObject<HTMLElement>}
          caption="Deals"
          columns={DEAL_COLUMNS}
          rows={JSON.stringify(deals.map(toRow))}
          total={deals.length}
          page={1}
          page-size={Math.max(deals.length, 10)}
          loading={loading}
          actions={actions.length > 0 ? JSON.stringify(actions) : undefined}
        />
      )}
      {ConfirmDialog}
    </div>
  );
}

export default DealsListPage;
