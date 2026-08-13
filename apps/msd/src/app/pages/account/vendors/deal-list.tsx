import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listAllDeals, type Deal } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';

const DEAL_COLUMNS = JSON.stringify([
  { key: 'Deal/Offering', label: 'Deal/Offering' },
  { key: 'Vendor', label: 'Vendor' },
  { key: 'Branch', label: 'Branch' },
  { key: 'Type', label: 'Type' },
  { key: 'Price', label: 'Price' },
  { key: 'Duration', label: 'Duration' },
  {
    key: 'Status',
    label: 'Status',
    type: 'status',
    statusMap: { ACTIVE: 'success', DRAFT: 'warning', INACTIVE: 'error', EXPIRED: 'error' },
  },
  {
    key: 'Approval Status',
    label: 'Approval Status',
    type: 'status',
    statusMap: { APPROVED: 'success', PENDING: 'warning', REJECTED: 'error' },
  },
]);

/** Not '__view_detail__' — editing a deal happens on its vendor's own page (VendorBranches,
 *  reused there), so the row action here just deep-links to that vendor. */
const DEAL_ACTIONS = JSON.stringify([{ icon: 'open_in_new', label: 'View vendor', event: 'view-vendor' }]);

/** Flat row for <sky-data-table> — 'Vendor ID' is an extra (non-column) key used only to drive
 *  the 'view-vendor' row action; it is not one of the visible columns. */
function toDealRow(deal: Deal): Record<string, string | number> {
  return {
    'Deal/Offering': deal.title,
    Vendor: deal.vendor?.businessName ?? '—',
    Branch: deal.branch?.name ?? '—',
    Type: deal.service ? 'Service' : 'Product',
    Price: `₹${deal.salePrice}`,
    Duration: deal.durationMinutes ? `${deal.durationMinutes} min` : '—',
    Status: deal.status,
    'Approval Status': deal.approvalStatus,
    'Vendor ID': deal.vendor?.id ?? '',
  };
}

interface TableParams {
  page: number;
  pageSize: number;
  search: string;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10, search: '' };

/** Cross-vendor Deals sidebar page — read list only; editing a deal happens on its vendor's
 *  own page (`VendorBranches`, reused there), reached via the "View vendor" action. Mirrors
 *  orders.tsx/bookings.tsx's <sky-data-table> pattern exactly. */
export function DealList() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);
  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listAllDeals(token, {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
      });
      setDeals(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load deals.');
    } finally {
      setLoading(false);
    }
  }, [token, params]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => JSON.stringify(deals.map(toDealRow)), [deals]);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    const onParamsChange = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      setParams({ page: detail.page, pageSize: detail.pageSize, search: detail.search });
    };
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; row: Record<string, unknown> }>).detail;
      if (detail.action !== 'view-vendor') return;
      const vendorId = detail.row['Vendor ID'];
      if (typeof vendorId === 'string' && vendorId) navigate(`/account/vendors?vendorId=${vendorId}`);
    };

    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
  }, [navigate]);

  return (
    <div className="admin-page admin-page--wide">
      <title>Deals · MSD</title>
      <header className="page-head">
        <div>
          <h1>Deals</h1>
          <p>Every deal across every vendor and branch.</p>
        </div>
      </header>

      {error && <p className="error-state" role="alert">{error}</p>}

      <sky-data-table
        ref={tableRef as RefObject<HTMLElement>}
        caption="Deals"
        columns={DEAL_COLUMNS}
        rows={rows}
        total={total}
        page={params.page}
        page-size={params.pageSize}
        loading={loading}
        searchable
        search-placeholder="Search by deal, vendor, or branch name…"
        actions={DEAL_ACTIONS}
      />
    </div>
  );
}

export default DealList;
