import './member-portal.css';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FilledButton, OutlinedButton, OutlinedTextField, PrimaryTab, Tabs } from '@skylabs-monorepo/shared-ui/react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getVoucherQueue, type VoucherQueueRow } from '../../../../api/rbac/vouchers';
import { ApiRequestError } from '../../../../api/rbac/client';
import { OrderManagement } from '../orders/orders';

const TABS = [
  { key: 'history', label: 'Order History' },
  { key: 'verify', label: 'Verify & Complete' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

function isTabKey(value: string | null): value is TabKey {
  return TABS.some((t) => t.key === value);
}

const ENTITLEMENT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  STARTED: 'Started',
  OTP_REQUESTED: 'OTP Requested',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

const STATUS_BADGE: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
  Active: 'info',
  Started: 'warning',
  'OTP Requested': 'warning',
  Completed: 'success',
  Cancelled: 'error',
  Refunded: 'error',
};

/** Deliberately not rendered as a per-row varying action button — `sky-data-table`'s `actions`
 *  prop defines one fixed icon/label applied uniformly to every row (confirmed from the
 *  component's own source: `_actionDefs` is one array shared by every `<tr>`), so a literal
 *  "Check Voucher"/"Continue"/"View Record" button per row isn't possible with this component.
 *  Shown instead as a status-style badge carrying the exact wording the spec asked for, plus one
 *  constant-labelled icon action ("Open") that performs the actual navigation for every row. */
function actionLabelFor(entitlementStatus: string): string {
  if (entitlementStatus === 'ACTIVE') return 'Check Voucher';
  if (entitlementStatus === 'STARTED' || entitlementStatus === 'OTP_REQUESTED') return 'Continue';
  return 'View Record';
}

const ACTION_BADGE: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
  'Check Voucher': 'info',
  Continue: 'warning',
  'View Record': 'success',
};

const QUEUE_COLUMNS = JSON.stringify([
  { key: 'Purchase', label: 'Voucher / Purchase', secondaryKey: 'Voucher Detail' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: STATUS_BADGE },
  { key: 'Action', label: 'Action', type: 'status', statusMap: ACTION_BADGE },
]);

const QUEUE_ACTIONS = JSON.stringify([{ icon: 'arrow_forward', label: 'Open', event: 'open-voucher' }]);

function toQueueRow(row: VoucherQueueRow): Record<string, string> {
  return {
    Purchase: row.itemName,
    'Voucher Detail': `Voucher ${row.voucherCode} · ${row.customerName ?? 'Customer'}`,
    Status: ENTITLEMENT_STATUS_LABEL[row.entitlementStatus] ?? row.entitlementStatus,
    Action: actionLabelFor(row.entitlementStatus),
    __voucherCode: row.voucherCode,
  };
}

interface QueueParams {
  page: number;
  pageSize: number;
  search: string;
}

const DEFAULT_QUEUE_PARAMS: QueueParams = { page: 1, pageSize: 10, search: '' };

/**
 * Member "Orders" (`/account/vendor-orders`, `vendor-portal.orders`) — replaces the old single-
 * page `OrdersAndVerify` with a real 2-tab layout, URL-synced via `?tab=history|verify` (default
 * `history`) so deep-linking and "Back to Verification" (from the Voucher Verification page and
 * from Order Details' per-entitlement links) land on the right tab.
 *
 * - **Order History**: the exact same `OrderManagement` order list every other order screen uses,
 *   just `scope="member"` (hides the admin-only "Search members"/"Member" picker).
 * - **Verify & Complete**: a voucher-code lookup (content-sized button, never full-width) plus
 *   the backend-sourced Service Queue (`GET /vouchers/queue`) — both routed to the resumable
 *   `/account/vendor-orders/verify/:code` detail page, never a page-local verify panel/state.
 */
export function MemberOrdersPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawTab = searchParams.get('tab');
  const tab: TabKey = isTabKey(rawTab) ? rawTab : 'history';

  const setTab = useCallback(
    (next: TabKey) => {
      setSearchParams(
        (prev) => {
          const usp = new URLSearchParams(prev);
          usp.set('tab', next);
          return usp;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const [refreshKey, setRefreshKey] = useState(0);
  const [code, setCode] = useState('');
  const openVoucher = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    navigate(`/account/vendor-orders/verify/${encodeURIComponent(trimmed)}`);
  };

  // Service Queue's own page/pageSize/search live under a `queue*`-prefixed URL param so they
  // never collide with Order History's own `page`/`pageSize`/`search`/`filter` params, which
  // share the same URL while only one tab's table is ever visible at a time.
  const queueParams = useMemo<QueueParams>(
    () => ({
      page: Number(searchParams.get('queuePage')) || DEFAULT_QUEUE_PARAMS.page,
      pageSize: Number(searchParams.get('queuePageSize')) || DEFAULT_QUEUE_PARAMS.pageSize,
      search: searchParams.get('queueSearch') ?? DEFAULT_QUEUE_PARAMS.search,
    }),
    [searchParams],
  );

  const setQueueParams = useCallback(
    (next: QueueParams) => {
      setSearchParams(
        (prev) => {
          const usp = new URLSearchParams(prev);
          usp.set('queuePage', String(next.page));
          usp.set('queuePageSize', String(next.pageSize));
          if (next.search) usp.set('queueSearch', next.search);
          else usp.delete('queueSearch');
          return usp;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const [queue, setQueue] = useState<VoucherQueueRow[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState('');

  const tableRef = useRef<HTMLElement>(null);

  const loadQueue = useCallback(async () => {
    if (tab !== 'verify') return;
    setQueueLoading(true);
    setQueueError('');
    try {
      const { data, meta } = await getVoucherQueue(token, queueParams);
      setQueue(data);
      setQueueTotal(meta?.total ?? data.length);
    } catch (err) {
      setQueueError(err instanceof ApiRequestError ? err.message : 'Could not load the service queue.');
    } finally {
      setQueueLoading(false);
    }
  }, [token, queueParams, tab]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue, refreshKey]);

  const queueRows = useMemo(() => JSON.stringify(queue.map(toQueueRow)), [queue]);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const onParamsChange = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      setQueueParams({ page: detail.page, pageSize: detail.pageSize, search: detail.search });
    };
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; row: Record<string, unknown> }>).detail;
      if (detail.action !== 'open-voucher') return;
      const voucherCode = detail.row['__voucherCode'];
      if (typeof voucherCode === 'string') navigate(`/account/vendor-orders/verify/${encodeURIComponent(voucherCode)}`);
    };
    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
  }, [navigate, setQueueParams, tab]);

  return (
    <div className="admin-page admin-page--wide member-portal">
      <title>Orders · MSD</title>
      <meta name="robots" content="noindex" />
      <header className="page-head">
        <div>
          <h1>Orders</h1>
          <p>Your order history, plus voucher verification and fulfilment.</p>
        </div>
        <OutlinedButton onClick={() => setRefreshKey((key) => key + 1)}>Refresh Status</OutlinedButton>
      </header>

      <div className="admin-tabs-wrap">
        <Tabs
          className="admin-tabs"
          onChange={(e) => setTab(TABS[(e.target as unknown as { activeTabIndex: number }).activeTabIndex].key)}
        >
          {TABS.map((t) => (
            <PrimaryTab key={t.key} active={tab === t.key}>
              {t.label}
            </PrimaryTab>
          ))}
        </Tabs>
      </div>

      {tab === 'history' && (
        <div className="admin-tab-panel" aria-label="Order History">
          <OrderManagement scope="member" refreshKey={refreshKey} />
        </div>
      )}

      {tab === 'verify' && (
        <div className="admin-tab-panel" aria-label="Verify &amp; Complete">
          <section aria-labelledby="voucher-lookup-title" className="panel">
            <h2 id="voucher-lookup-title" className="section-title">Unique Voucher Code</h2>
            <form className="voucher-lookup-row member-action-row" onSubmit={openVoucher}>
              <OutlinedTextField
                label="Unique Voucher Code"
                value={code}
                onInput={(e: Event) => setCode((e.target as HTMLInputElement).value)}
              />
              <FilledButton type="submit" disabled={!code.trim()}>
                Open Voucher
              </FilledButton>
            </form>
          </section>

          <section aria-labelledby="service-queue-title">
            <h2 id="service-queue-title" className="section-title">Service Queue</h2>
            {queueError && <p className="error-state" role="alert">{queueError}</p>}
            <sky-data-table
              ref={tableRef as RefObject<HTMLElement>}
              caption="Service Queue"
              columns={QUEUE_COLUMNS}
              rows={queueRows}
              total={queueTotal}
              page={queueParams.page}
              page-size={queueParams.pageSize}
              loading={queueLoading}
              searchable
              search-placeholder="Search by voucher code, item, or customer…"
              actions={QUEUE_ACTIONS}
            />
          </section>
        </div>
      )}
    </div>
  );
}

export default MemberOrdersPage;
