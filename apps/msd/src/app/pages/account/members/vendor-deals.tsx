import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilledButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { dealApi, listMyBranches, type Branch, type Deal } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { showSnackbar } from '../../../../snackbar/snackbar';
import { fromPriceLabel } from './deal-format';

const DEAL_COLUMNS = JSON.stringify([
  { key: 'Deal', label: 'Deal' },
  { key: 'Branch', label: 'Branch' },
  { key: 'Packages', label: 'Packages' },
  { key: 'Price', label: 'Price' },
  {
    key: 'Status',
    label: 'Status',
    type: 'status',
    statusMap: { ACTIVE: 'success', DRAFT: 'warning', INACTIVE: 'error', EXPIRED: 'error' },
  },
]);

const DEAL_ACTIONS = JSON.stringify([
  { icon: 'edit', label: 'Edit', event: 'edit' },
  { icon: 'toggle_on', label: 'Go live / Pause', event: 'toggle-status' },
]);

function toRow(d: Deal): Record<string, string | number> {
  const active = (d.packages ?? []).filter((p) => p.isActive).length;
  return {
    Deal: d.title,
    Branch: [d.branch?.name, d.branch?.city].filter(Boolean).join(', ') || '—',
    Packages: `${active} active`,
    Price: fromPriceLabel(d),
    Status: d.status,
  };
}

interface TableParams {
  page: number;
  pageSize: number;
}

/**
 * The member's own Deals page: every deal across their branches (`GET /vendors/me/deals`). Add
 * and Edit open the shared deal form (`/account/vendor-deals/new`, `/:dealId`, PLANNING §2.7);
 * with no branch yet it asks for one first.
 */
export function VendorDeals() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const api = useMemo(() => dealApi(token, { kind: 'member' }), [token]);
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [params, setParams] = useState<TableParams>({ page: 1, pageSize: 20 });
  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [mine, myBranches] = await Promise.all([api.listAll(), listMyBranches(token)]);
      setDeals(mine.data);
      setBranches(myBranches.data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load your deals.');
    } finally {
      setLoading(false);
    }
  }, [api, token]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleStatus = async (deal: Deal) => {
    setError('');
    try {
      const next = deal.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const { data } = await api.setStatus(deal.branchId, deal.id, next);
      setDeals((prev) => prev.map((d) => (d.id === data.id ? data : d)));
      showSnackbar(next === 'ACTIVE' ? 'The deal is live.' : 'The deal is paused.');
    } catch (err) {
      // DEAL_NOT_READY lists what is missing (an image, an active package).
      setError(err instanceof ApiRequestError ? err.message : 'Could not change the status.');
    }
  };

  const pageRows = useMemo(
    () => deals.slice((params.page - 1) * params.pageSize, params.page * params.pageSize),
    [deals, params],
  );
  const rows = useMemo(() => JSON.stringify(pageRows.map(toRow)), [pageRows]);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const onParamsChange = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      setParams({ page: detail.page, pageSize: detail.pageSize });
    };
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; rowIndex: number }>).detail;
      const deal = pageRows[detail.rowIndex];
      if (!deal) return;
      if (detail.action === 'edit') navigate(`/account/vendor-deals/${deal.id}`);
      else if (detail.action === 'toggle-status') toggleStatus(deal);
    };
    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toggleStatus is recreated each render
  }, [pageRows, navigate]);

  const noBranch = branches !== null && branches.length === 0;

  return (
    <div className="admin-page admin-page--wide">
      <title>Deals · MSD</title>
      <header className="page-head">
        <div>
          <h1>Deals</h1>
          <p>Every deal across your branches. A new deal starts as a draft; add images and go live from the deal.</p>
        </div>
        {!noBranch && (
          <div className="page-head__actions">
            <FilledButton onClick={() => navigate('/account/vendor-deals/new')}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              Add deal
            </FilledButton>
          </div>
        )}
      </header>

      {error && <p className="error-state" role="alert">{error}</p>}

      {!loading && noBranch ? (
        <div>
          <p className="empty-state">Add a branch first: pick its state and city, then add deals to it.</p>
          <FilledButton onClick={() => navigate('/account/vendor-branches-deals')}>
            <Icon slot="icon" aria-hidden="true">add_business</Icon>
            Add a branch
          </FilledButton>
        </div>
      ) : (
        <sky-data-table
          ref={tableRef as RefObject<HTMLElement>}
          caption="Deals"
          columns={DEAL_COLUMNS}
          rows={rows}
          total={deals.length}
          page={params.page}
          page-size={params.pageSize}
          loading={loading}
          actions={DEAL_ACTIONS}
        />
      )}
    </div>
  );
}

export default VendorDeals;
