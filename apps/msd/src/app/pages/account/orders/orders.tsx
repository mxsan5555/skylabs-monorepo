import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Dialog, FilledButton, Icon, OutlinedButton, OutlinedSelect, OutlinedTextField, SelectOption, TextButton } from '@skylabs-monorepo/shared-ui/react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  listOrders,
  getOrderCounts,
  setOrderStatus,
  shortOrderNumber,
  type Order,
  type OrderCounts,
  type OrderStatus,
  type PaymentStatus,
} from '../../../../api/rbac/orders';
import { listVendors, type Vendor } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { formatINR } from '../../../../utils/format';
import { customerDisplayName } from '../customers/customer-list';
import { CardGrid } from '../../../components/card-grid/card-grid';

const ALLOWED_NEXT: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

const ORDER_COLUMNS = JSON.stringify([
  { key: 'Order', label: 'Order', secondaryKey: 'Order Date', width: '150px' },
  { key: 'Customer', label: 'Customer', secondaryKey: 'Customer Phone' },
  { key: 'Purchase', label: 'Purchase / Member', secondaryKey: 'Purchase Detail' },
  { key: 'Amount', label: 'Amount' },
  {
    key: 'Payment Status',
    label: 'Payment Status',
    type: 'status',
    statusMap: { CREATED: 'info', PAID: 'success', FAILED: 'error', CANCELLED: 'warning' },
  },
  {
    key: 'Order Status',
    label: 'Order Status',
    type: 'status',
    statusMap: { PENDING_PAYMENT: 'warning', CONFIRMED: 'info', COMPLETED: 'success', CANCELLED: 'error' },
  },
]);

const ORDER_STATUS_FILTERS = JSON.stringify([
  { label: 'Pending Payment', value: 'PENDING_PAYMENT' },
  { label: 'Confirmed', value: 'CONFIRMED' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Cancelled', value: 'CANCELLED' },
]);

const PAYMENT_STATUS_OPTIONS: { value: PaymentStatus; label: string }[] = [
  { value: 'CREATED', label: 'Created' },
  { value: 'PAID', label: 'Paid' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const ORDER_STATUSES: readonly OrderStatus[] = ['PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];

function parsePositiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * "Deal Order" / "Product Order" / "Therapist Order" / "Mixed Order" — computed from the
 * composition of the order's own items, never stored (mirrors msd-api's
 * order.service.ts#describeOrderComposition exactly). A line is a Deal purchase if `dealId` is
 * set, a Therapist purchase if `therapistId` is set (mutually exclusive for a SERVICE item), or
 * a Product purchase if neither is set.
 */
export function describeOrderComposition(order: Order): string {
  const kinds = new Set(order.items.map((item) => (item.therapistId ? 'Therapist' : item.dealId ? 'Deal' : 'Product')));
  return kinds.size === 1 ? `${[...kinds][0]} Order` : 'Mixed Order';
}

/** Flat row for <sky-data-table> — `__orderId`/`__customerId` are non-column, non-rendered keys
 *  (same convention this file already used for extra fields) carrying the raw ids the row
 *  actions need; every visible column uses the new Order/Date, Customer/Phone, Purchase/Member
 *  groups via `secondaryKey` instead of the old one-field-per-column layout. */
function toOrderRow(order: Order): Record<string, string | number> {
  const latestPayment = order.payments.length
    ? [...order.payments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : null;
  const vendorIds = new Set(order.items.map((i) => i.vendorId));
  const firstItem = order.items[0];
  const moreCount = Math.max(order.items.length - 1, 0);
  const purchasePrimary = firstItem
    ? `${firstItem.itemName}${moreCount > 0 ? ` +${moreCount} more item${moreCount > 1 ? 's' : ''}` : ''}`
    : '—';
  const memberLabel =
    vendorIds.size > 1 ? `${vendorIds.size} members` : firstItem?.vendorNameSnapshot ?? order.vendorNameSnapshot;

  return {
    Order: shortOrderNumber(order.id),
    'Order Date': new Date(order.createdAt).toLocaleString(),
    Customer: customerDisplayName(order.customer),
    'Customer Phone': order.customer.phone ?? '—',
    Purchase: purchasePrimary,
    'Purchase Detail': `${describeOrderComposition(order)} · ${memberLabel}`,
    Amount: formatINR(Number(order.total)),
    'Payment Status': latestPayment?.status ?? '—',
    'Order Status': order.status,
    __orderId: order.id,
    __customerId: order.customerId,
  };
}

interface TableParams {
  page: number;
  pageSize: number;
  search: string;
  filter: string;
  paymentStatus: PaymentStatus | '';
  vendorId: string;
  customerId?: string;
  excludeOrderId?: string;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10, search: '', filter: '', paymentStatus: '', vendorId: '' };

interface OrderListBackState {
  fromOrderId?: string;
  fromOrderBackTo?: string;
  customerName?: string;
  customerPhone?: string | null;
}

/** One list serves both audiences: an admin sees every order, a vendor caller is force-scoped
 *  server-side to its own vendor (order.service.ts#listOrders) — no second vendor-only page.
 *  Page/pageSize/search/filter/paymentStatus/member all live in the URL (same reasoning as
 *  `customers.tsx`'s own doc comment: navigating into an order's/customer's own page unmounts
 *  this list entirely, so the browser's own Back button is what restores this exact state).
 *
 *  `scope="member"` is the Member Orders page's "Order History" tab (`MemberOrdersPage`) — same
 *  component, same filters/pagination/summary-cards/customerId handling, just without the
 *  "Search members"/"Member" picker (a member has no business seeing a global member filter on
 *  their own order list). Default `scope="admin"` preserves the existing `/account/orders`
 *  behaviour unchanged. */
export function OrderManagement({ scope = 'admin', refreshKey = 0 }: { scope?: 'admin' | 'member'; refreshKey?: number } = {}) {
  const { token, can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const params = useMemo<TableParams>(() => {
    const filter = searchParams.get('filter') ?? '';
    const paymentStatus = searchParams.get('paymentStatus') ?? '';
    return {
      page: parsePositiveInteger(searchParams.get('page'), DEFAULT_PARAMS.page),
      pageSize: parsePositiveInteger(searchParams.get('pageSize'), DEFAULT_PARAMS.pageSize),
      search: searchParams.get('search') ?? DEFAULT_PARAMS.search,
      filter: ORDER_STATUSES.includes(filter as OrderStatus) ? filter : '',
      paymentStatus: PAYMENT_STATUS_OPTIONS.some((option) => option.value === paymentStatus)
        ? (paymentStatus as PaymentStatus)
        : '',
      vendorId: searchParams.get('vendorId') ?? '',
      customerId: searchParams.get('customerId') || undefined,
      excludeOrderId: searchParams.get('excludeOrderId') || undefined,
    };
  }, [searchParams]);
  const setParams = useCallback(
    (next: Pick<TableParams, 'page' | 'pageSize' | 'search' | 'filter'>) => {
      setSearchParams(
        (previous) => {
          const updated = new URLSearchParams(previous);
          updated.set('page', String(next.page));
          updated.set('pageSize', String(next.pageSize));
          if (next.search) updated.set('search', next.search);
          else updated.delete('search');
          if (next.filter) updated.set('filter', next.filter);
          else updated.delete('filter');
          return updated;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const updateFilter = useCallback(
    (key: 'paymentStatus' | 'vendorId', value: string) => {
      setSearchParams((previous) => {
        const updated = new URLSearchParams(previous);
        updated.set('page', '1');
        if (value) updated.set(key, value);
        else updated.delete(key);
        return updated;
      });
    },
    [setSearchParams],
  );
  const clearCustomerFilter = useCallback(() => {
    setSearchParams((previous) => {
      const updated = new URLSearchParams(previous);
      updated.delete('customerId');
      updated.delete('excludeOrderId');
      updated.set('page', '1');
      return updated;
    });
  }, [setSearchParams]);
  const backState =
    location.state && typeof location.state === 'object' ? (location.state as OrderListBackState) : null;
  // D27: only `orders:status_change` (Super Admin, Admin) changes an order; members view their own
  // orders only, for deals and products alike. The API refuses members with 403 as well.
  const canChangeStatus = can('orders', 'status_change');
  const canViewCustomers = can('customers', 'view');

  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [counts, setCounts] = useState<OrderCounts | null>(null);

  const customerFilterUnavailable = Boolean(params.customerId && !canViewCustomers);

  // Lazy, searchable member picker (never loads the full vendor list — mirrors the
  // search-as-you-type picker already used by `popular-tags.tsx`'s mapping dialog): fetches at
  // most 20 matches for whatever the admin has typed so far.
  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorOptions, setVendorOptions] = useState<Vendor[]>([]);
  useEffect(() => {
    // `scope="member"` never renders the member picker (below) — skip the `vendors:view`-gated
    // lookup entirely rather than firing a request a member caller would just 403 on.
    if (scope !== 'admin') return;
    listVendors(token, { search: vendorSearch || undefined, pageSize: 20 })
      .then(({ data }) => setVendorOptions(data))
      .catch(() => setVendorOptions([]));
  }, [token, vendorSearch, scope]);

  const [statusOrder, setStatusOrder] = useState<Order | null>(null);
  const [statusValue, setStatusValue] = useState<OrderStatus | ''>('');
  const [statusError, setStatusError] = useState('');
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const statusDialogRef = useRef<MdDialog>(null);

  const tableRef = useRef<HTMLElement>(null);

  // Deep-link support for a "New Order Received" notification click (see notification-bell.tsx)
  // — it now links straight to the routed detail page below, so this list no longer needs its
  // own `?orderId=` handling or generic drawer dialog.

  const load = useCallback(async () => {
    if (customerFilterUnavailable) {
      setOrders([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listOrders(token, {
        page: params.page,
        pageSize: params.pageSize,
        status: (params.filter || undefined) as OrderStatus | undefined,
        paymentStatus: params.paymentStatus || undefined,
        vendorId: params.vendorId || undefined,
        customerId: params.customerId,
        excludeOrderId: params.excludeOrderId,
        search: params.search || undefined,
      });
      setOrders(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load orders.');
    } finally {
      setLoading(false);
    }
  }, [token, params, customerFilterUnavailable]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // The three summary cards — always a real server-side count (never derived from the current
  // page). Deliberately narrowed by the SAME filters as the list EXCEPT status/paymentStatus
  // (see msd-api's `getOrderCounts` doc comment for why) — so they stay a stable "of everything
  // matching my member/search filters" context regardless of which status row is on screen.
  const loadCounts = useCallback(async () => {
    if (customerFilterUnavailable) {
      setCounts(null);
      return;
    }
    try {
      const { data } = await getOrderCounts(token, {
        vendorId: params.vendorId || undefined,
        customerId: params.customerId,
        excludeOrderId: params.excludeOrderId,
        search: params.search || undefined,
      });
      setCounts(data);
    } catch {
      setCounts(null);
    }
  }, [token, params.vendorId, params.customerId, params.excludeOrderId, params.search, customerFilterUnavailable]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts, refreshKey]);

  const scopedByFilter = Boolean(params.vendorId || params.search || params.customerId);

  const rows = useMemo(() => JSON.stringify(orders.map(toOrderRow)), [orders]);

  const actions = useMemo(
    () =>
      JSON.stringify([
        { icon: 'visibility', label: 'View', event: 'view-order' },
        ...(canViewCustomers ? [{ icon: 'person', label: 'View Customer', event: 'view-customer' }] : []),
        ...(canChangeStatus ? [{ icon: 'sync_alt', label: 'Change status', event: 'change-status' }] : []),
      ]),
    [canChangeStatus, canViewCustomers],
  );

  const openStatusDialog = useCallback((order: Order) => {
    setStatusOrder(order);
    setStatusValue('');
    setStatusError('');
    statusDialogRef.current?.show();
  }, []);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    const onParamsChange = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      setParams({ page: detail.page, pageSize: detail.pageSize, search: detail.search, filter: detail.filter });
    };
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; row: Record<string, unknown> }>).detail;
      const orderId = detail.row['__orderId'];
      if (detail.action === 'view-order' && typeof orderId === 'string') {
        navigate(`/account/orders/${orderId}`, { state: { backTo: `${location.pathname}${location.search}` } });
        return;
      }
      if (detail.action === 'view-customer') {
        const customerId = detail.row['__customerId'];
        if (typeof customerId === 'string') navigate(`/account/customers/${customerId}`);
        return;
      }
      if (detail.action === 'change-status') {
        const order = orders.find((o) => o.id === orderId);
        if (order) openStatusDialog(order);
      }
    };

    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
  }, [orders, openStatusDialog, navigate, location.pathname, location.search, setParams]);

  const closeStatusDialog = () => {
    statusDialogRef.current?.close();
  };

  const submitStatusChange = async () => {
    if (!statusOrder || !statusValue) return;
    setStatusSubmitting(true);
    setStatusError('');
    try {
      const { data } = await setOrderStatus(token, statusOrder.id, statusValue);
      setOrders((prev) => prev.map((o) => (o.id === data.id ? data : o)));
      closeStatusDialog();
    } catch (err) {
      setStatusError(err instanceof ApiRequestError ? err.message : 'Could not change order status.');
    } finally {
      setStatusSubmitting(false);
    }
  };

  const allowedNext = statusOrder ? ALLOWED_NEXT[statusOrder.status] : [];

  // Derived from the already-loaded, already-filtered rows (every one shares the same customer)
  // — no separate customer lookup needed; `backState` is only an optimistic first-paint hint
  // while the list is still loading.
  const filteredCustomerName = orders[0]?.customer.name ?? backState?.customerName ?? '';
  const filteredCustomerPhone = orders[0]?.customer.phone ?? backState?.customerPhone ?? null;

  return (
    <div className="admin-page admin-page--wide">
      <title>Orders · MSD</title>
      <meta name="robots" content="noindex" />
      {scope === 'admin' && <header className="page-head">
        <div>
          <h1>Orders</h1>
          <p>Every order from the marketplace catalogue — Deal, Product, and Therapist alike.</p>
        </div>
        {backState?.fromOrderId && backState?.fromOrderBackTo && (
          <div className="page-head__actions">
            <OutlinedButton onClick={() => backState.fromOrderBackTo && navigate(backState.fromOrderBackTo)}>
              <Icon slot="icon" aria-hidden="true">arrow_back</Icon>
              Back to Order #{shortOrderNumber(backState.fromOrderId)}
            </OutlinedButton>
          </div>
        )}
      </header>}

      {customerFilterUnavailable ? (
        <p className="error-state" role="alert">
          This customer filter is unavailable. Showing no orders rather than an unfiltered list.{' '}
          <TextButton onClick={clearCustomerFilter}>Clear filter</TextButton>
        </p>
      ) : (
        params.customerId && (
          <p className="field-hint" role="status">
            Filtered to {filteredCustomerName || 'this customer'}
            {filteredCustomerPhone ? ` · ${filteredCustomerPhone}` : ''}
            {' — '}
            <TextButton onClick={clearCustomerFilter}>Clear filter</TextButton>
          </p>
        )
      )}

      {error && <p className="error-state" role="alert">{error}</p>}

      {scope === 'admin' && <>
      <CardGrid layout="compact">
        <sky-tile-card color="surface-high" icon="receipt_long" icon-style="surface" headline={String(counts?.total ?? '—')} text="All orders" />
        <sky-tile-card color="secondary" icon="task_alt" icon-style="surface" headline={String(counts?.paid ?? '—')} text="Paid" />
        <sky-tile-card color="tertiary" icon="hourglass_top" icon-style="surface" headline={String(counts?.pendingPayment ?? '—')} text="Awaiting Payment" />
      </CardGrid>
      <p className="field-hint">
        {scopedByFilter ? 'Totals within your current member/search filters.' : 'Totals across every order.'} Order/Payment status
        filters never change these three numbers — they stay a stable count of what else you've filtered to.
      </p>

      </>}

      <div className="form-grid" style={{ maxWidth: 420, marginBottom: 16 }}>
        <OutlinedSelect
          label="Payment Status"
          value={params.paymentStatus}
          onChange={(e: Event) => updateFilter('paymentStatus', (e.target as HTMLSelectElement).value)}
        >
          <SelectOption value=""><div slot="headline">All payment statuses</div></SelectOption>
          {PAYMENT_STATUS_OPTIONS.map((opt) => (
            <SelectOption key={opt.value} value={opt.value}><div slot="headline">{opt.label}</div></SelectOption>
          ))}
        </OutlinedSelect>

        {scope === 'admin' && (
          <>
            <OutlinedTextField
              label="Search members"
              value={vendorSearch}
              onInput={(e: Event) => setVendorSearch((e.target as HTMLInputElement).value)}
            />
            <OutlinedSelect
              label="Member"
              value={params.vendorId}
              onChange={(e: Event) => updateFilter('vendorId', (e.target as HTMLSelectElement).value)}
            >
              <SelectOption value=""><div slot="headline">All members</div></SelectOption>
              {vendorOptions.map((v) => (
                <SelectOption key={v.id} value={v.id}><div slot="headline">{v.businessName ?? v.id}</div></SelectOption>
              ))}
            </OutlinedSelect>
          </>
        )}
      </div>

      <sky-data-table
        ref={tableRef as RefObject<HTMLElement>}
        caption="Orders"
        columns={ORDER_COLUMNS}
        rows={rows}
        total={total}
        page={params.page}
        page-size={params.pageSize}
        loading={loading}
        searchable
        search-placeholder="Search by customer, phone, vendor, branch, or item…"
        filter-label="Order Status"
        filter-options={ORDER_STATUS_FILTERS}
        actions={actions}
      />

      <Dialog ref={statusDialogRef} onClose={() => setStatusOrder(null)}>
        <div slot="headline">Change order status</div>
        <div slot="content" className="form-grid">
          {statusOrder && (
            <>
              <p className="field-hint">
                Order {shortOrderNumber(statusOrder.id)} · currently {statusOrder.status}
              </p>
              {allowedNext.length === 0 ? (
                <p className="empty-state">No further status changes available.</p>
              ) : (
                <OutlinedSelect
                  label="New status"
                  value={statusValue}
                  onChange={(e: Event) => setStatusValue((e.target as HTMLSelectElement).value as OrderStatus)}
                >
                  <SelectOption value="">
                    <div slot="headline">Select…</div>
                  </SelectOption>
                  {allowedNext.map((s) => (
                    <SelectOption key={s} value={s}>
                      <div slot="headline">{s}</div>
                    </SelectOption>
                  ))}
                </OutlinedSelect>
              )}
              {statusOrder.cancellationReason && <p className="error-state">Cancelled: {statusOrder.cancellationReason}</p>}
              {statusError && <p className="error-state" role="alert">{statusError}</p>}
            </>
          )}
        </div>
        <div slot="actions">
          <TextButton onClick={closeStatusDialog}>{allowedNext.length === 0 ? 'Close' : 'Cancel'}</TextButton>
          {allowedNext.length > 0 && (
            <FilledButton onClick={submitStatusChange} disabled={!statusValue || statusSubmitting}>
              {statusSubmitting ? 'Saving…' : 'Save'}
            </FilledButton>
          )}
        </div>
      </Dialog>
    </div>
  );
}

export default OrderManagement;
