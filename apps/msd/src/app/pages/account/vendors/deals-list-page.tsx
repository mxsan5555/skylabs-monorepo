import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilledButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { listVendorDealsForAdmin, setDealStatus, deleteDeal, type AdminDeal } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useConfirmDialog } from '../../../components/confirm-dialog';

interface DealsListPageProps {
  token: string | null;
  vendorId: string;
  /** Gates "Add deal" and each row's Edit/Toggle-status action — same coarse `vendors:edit`
   *  prop `BranchesListPage`/`TherapistsTab` already take (the backend's nested
   *  `vendors.deals:*` permissions are the real enforcement either way). */
  canEdit: boolean;
  /** Gates the Delete row action — mirrors `vendor-detail-page.tsx`'s own `canDelete`. */
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
    Price: `₹${d.salePrice}`,
    Therapists: therapistCount > 0 ? `${therapistCount} linked` : 'None linked',
    Status: d.status,
  };
}

/** Deals — data table, vendor-wide (every branch). Plugged into `VendorDetailPage`'s
 *  `section="deals"`. Add/Edit are full pages (`/deals/new`, `/deals/:dealId`), mirroring
 *  Branches' own list+form pattern; a deal's Delete is a real hard delete (blocked server-side,
 *  409, if it has order/cart history — use the status toggle instead in that case). */
export function DealsListPage({ token, vendorId, canEdit, canDelete }: DealsListPageProps) {
  const navigate = useNavigate();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [deals, setDeals] = useState<AdminDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await listVendorDealsForAdmin(token, vendorId);
      setDeals(data);
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
      if (detail.action === 'edit') navigate(`/account/vendors/${vendorId}/deals/${deal.id}`);
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
        {canEdit && (
          <div className="page-head__actions">
            <FilledButton onClick={() => navigate(`/account/vendors/${vendorId}/deals/new`)}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              Add deal
            </FilledButton>
          </div>
        )}
      </div>

      {error && <p className="error-state" role="alert">{error}</p>}

      {!loading && deals.length === 0 ? (
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
