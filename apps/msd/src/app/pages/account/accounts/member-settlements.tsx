import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { TextButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listMemberSettlements, type MemberSettlementRow } from '../../../../api/rbac/settlements';
import { ApiRequestError } from '../../../../api/rbac/client';

const COLUMNS = JSON.stringify([
  { key: 'Member', label: 'Member', secondaryKey: 'Branch / City' },
  { key: 'Bank Reference', label: 'Bank Reference' },
  { key: 'Pending Fulfilment', label: 'Pending Fulfilment' },
  { key: 'On Hold', label: 'On Hold' },
  { key: 'Ready for Payout', label: 'Ready for Payout' },
  { key: 'Paid', label: 'Paid' },
]);

// An ordinary action event — never the magic `__view_detail__` string, which `sky-data-table`
// intercepts natively to open its own generic key/value drawer and never dispatches as
// `sky-dt-row-action` at all (same drawer-trap bug fixed on `orders.tsx`'s "View" action;
// discovered here on this file during this task since it meant the row click below never
// actually navigated anywhere before this fix).
const ACTIONS = JSON.stringify([{ icon: 'visibility', label: 'View', event: 'view-member' }]);

/** `Vendor Id` is an extra (non-column) key — never rendered as its own column, just available
 *  for the row-action handler below, same convention as `orders.tsx`'s extra `__orderId` key.
 *  `Bank Reference` is the masked `••••1234`-style reference — the full number stays
 *  detail-page-only (never shipped to this list). */
function toRow(row: MemberSettlementRow): Record<string, string | number> {
  return {
    Member: row.businessName ?? 'Draft member',
    'Branch / City': [row.primaryBranchName, row.primaryBranchCity].filter(Boolean).join(' · ') || '—',
    'Bank Reference': row.bankReferenceMasked ?? (row.bankDetailsOnFile ? 'On file' : 'Missing'),
    'Pending Fulfilment': `₹${row.pendingFulfilment}`,
    'On Hold': `₹${row.onHold}`,
    'Ready for Payout': `₹${row.readyForPayout}`,
    Paid: `₹${row.paid}`,
    'Vendor Id': row.vendorId,
  };
}

interface TableParams {
  page: number;
  pageSize: number;
  search: string;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10, search: '' };

/** Super-Admin "Member Settlements" list — vendor-wise aggregates from `GET
 *  /settlements/members`. Page/pageSize/search live in the URL (same reasoning as
 *  `customers.tsx`'s own doc comment: this list unmounts while a member's detail page is open,
 *  so the browser's own Back button is what restores it). An initial `?status=ready` (the
 *  Accounts Overview "Review Payouts" deep link) is read once on mount and kept in the URL the
 *  same way — toggled off via the "Show all members" button below, never silently dropped on
 *  the next page/search change. */
export function MemberSettlementsPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [rows, setRows] = useState<MemberSettlementRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const params = useMemo<TableParams>(
    () => ({
      page: Number(searchParams.get('page')) || DEFAULT_PARAMS.page,
      pageSize: Number(searchParams.get('pageSize')) || DEFAULT_PARAMS.pageSize,
      search: searchParams.get('search') ?? DEFAULT_PARAMS.search,
    }),
    [searchParams],
  );
  const readyOnly = searchParams.get('status') === 'ready';

  const setParams = useCallback(
    (next: TableParams) => {
      setSearchParams(
        (prev) => {
          const usp = new URLSearchParams(prev);
          usp.set('page', String(next.page));
          usp.set('pageSize', String(next.pageSize));
          if (next.search) usp.set('search', next.search);
          else usp.delete('search');
          return usp;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const clearReadyFilter = () => {
    setSearchParams((prev) => {
      const usp = new URLSearchParams(prev);
      usp.delete('status');
      usp.set('page', '1');
      return usp;
    });
  };

  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listMemberSettlements(token, {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
        status: readyOnly ? 'ready' : undefined,
      });
      setRows(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load member settlements.');
    } finally {
      setLoading(false);
    }
  }, [token, params, readyOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const tableRows = useMemo(() => JSON.stringify(rows.map(toRow)), [rows]);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const onParamsChange = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      setParams({ page: detail.page, pageSize: detail.pageSize, search: detail.search });
    };
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; row: Record<string, unknown> }>).detail;
      const vendorId = detail.row['Vendor Id'];
      if (typeof vendorId === 'string') navigate(`/account/accounts/member-settlements/${vendorId}`);
    };
    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
  }, [navigate, setParams]);

  return (
    <div className="admin-page admin-page--wide">
      <title>Member Settlements · MSD</title>
      <meta name="robots" content="noindex" />
      <header className="page-head">
        <div>
          <h1>Member Settlements</h1>
          <p>Each member's pending, on-hold, ready-for-payout, and paid balances.</p>
        </div>
      </header>

      {readyOnly && (
        <p className="field-hint" role="status">
          Showing only members ready for payout. <TextButton onClick={clearReadyFilter}>Show all members</TextButton>
        </p>
      )}

      {error && <p className="error-state" role="alert">{error}</p>}

      <sky-data-table
        ref={tableRef as RefObject<HTMLElement>}
        caption="Member Settlements"
        columns={COLUMNS}
        rows={tableRows}
        total={total}
        page={params.page}
        page-size={params.pageSize}
        loading={loading}
        searchable
        search-placeholder="Search by member name…"
        actions={ACTIONS}
      />
    </div>
  );
}

export default MemberSettlementsPage;
