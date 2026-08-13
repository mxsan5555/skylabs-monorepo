import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listAllBranches, type Branch } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';

const BRANCH_COLUMNS = JSON.stringify([
  { key: 'Branch Name', label: 'Branch Name' },
  { key: 'Vendor', label: 'Vendor' },
  { key: 'City/State', label: 'City/State' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } },
]);

/** Not '__view_detail__' — editing a branch happens on its vendor's own page (VendorBranches,
 *  reused there), so the row action here just deep-links to that vendor. */
const BRANCH_ACTIONS = JSON.stringify([{ icon: 'open_in_new', label: 'View vendor', event: 'view-vendor' }]);

/** Flat row for <sky-data-table> — 'Vendor ID' is an extra (non-column) key used only to drive
 *  the 'view-vendor' row action; it is not one of the visible columns. */
function toBranchRow(branch: Branch): Record<string, string | number> {
  return {
    'Branch Name': branch.name,
    Vendor: branch.vendor?.businessName ?? '—',
    'City/State': [branch.city, branch.state].filter(Boolean).join(', ') || '—',
    Status: branch.isActive ? 'Active' : 'Inactive',
    'Vendor ID': branch.vendor?.id ?? '',
  };
}

interface TableParams {
  page: number;
  pageSize: number;
  search: string;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10, search: '' };

/** Cross-vendor Branches sidebar page — read list only; editing a branch happens on its
 *  vendor's own page (`VendorBranches`, reused there), reached via the "View vendor" action.
 *  Mirrors orders.tsx/bookings.tsx's <sky-data-table> pattern exactly. */
export function BranchList() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);
  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listAllBranches(token, {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
      });
      setBranches(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load branches.');
    } finally {
      setLoading(false);
    }
  }, [token, params]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => JSON.stringify(branches.map(toBranchRow)), [branches]);

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
      <title>Branches · MSD</title>
      <header className="page-head">
        <div>
          <h1>Branches</h1>
          <p>Every branch across every vendor.</p>
        </div>
      </header>

      {error && <p className="error-state" role="alert">{error}</p>}

      <sky-data-table
        ref={tableRef as RefObject<HTMLElement>}
        caption="Branches"
        columns={BRANCH_COLUMNS}
        rows={rows}
        total={total}
        page={params.page}
        page-size={params.pageSize}
        loading={loading}
        searchable
        search-placeholder="Search by branch or vendor name…"
        actions={BRANCH_ACTIONS}
      />
    </div>
  );
}

export default BranchList;
