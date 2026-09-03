import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { Dialog, FilledButton, OutlinedSelect, SelectOption, TextButton } from '@skylabs-monorepo/shared-ui/react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listOrders, setOrderStatus, type Order, type OrderStatus } from '../../../../api/rbac/orders';
import { ApiRequestError } from '../../../../api/rbac/client';

const ALLOWED_NEXT: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

const ORDER_COLUMNS = JSON.stringify([
  { key: 'Order ID', label: 'Order ID', width: '110px' },
  { key: 'Customer', label: 'Customer' },
  { key: 'Vendor', label: 'Vendor' },
  { key: 'Branch', label: 'Branch' },
  { key: 'Composition', label: 'Composition' },
  { key: 'Item', label: 'Item' },
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
  { key: 'Created At', label: 'Created At' },
]);

const ORDER_FILTERS = JSON.stringify([
  { label: 'Pending Payment', value: 'PENDING_PAYMENT' },
  { label: 'Confirmed', value: 'CONFIRMED' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Cancelled', value: 'CANCELLED' },
]);

/**
 * "Deal Order" / "Product Order" / "Therapist Order" / "Mixed Order" — computed from the
 * composition of the order's own items, never stored (mirrors msd-api's
 * order.service.ts#describeOrderComposition exactly). A line is a Deal purchase if `dealId` is
 * set, a Therapist purchase if `therapistId` is set (mutually exclusive for a SERVICE item), or
 * a Product purchase if neither is set.
 */
function describeOrderComposition(order: Order): string {
  const kinds = new Set(order.items.map((item) => (item.therapistId ? 'Therapist' : item.dealId ? 'Deal' : 'Product')));
  return kinds.size === 1 ? `${[...kinds][0]} Order` : 'Mixed Order';
}

/** Flat row for <sky-data-table> — every key here is human-readable because the component's
 *  built-in detail drawer renders Object.entries(row) verbatim (raw key as label, no
 *  formatting), so extra (non-column) keys double as the "Order Detail" view. */
function toOrderRow(order: Order): Record<string, string | number> {
  const latestPayment = order.payments.length
    ? [...order.payments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : null;
  // A vendor caller's `items` is already scoped server-side to only their own vendorId (see
  // order.service.ts#scopeOrderItemsToVendor) — when every visible item shares one vendorId,
  // show THAT vendor/branch rather than Order's own "primary vendor" snapshot, which may belong
  // to a different vendor on a genuinely multi-vendor order an admin created. Admin callers see
  // every item, so a real multi-vendor order falls through to the primary-vendor snapshot below.
  const singleVendorItem =
    order.items.length > 0 && order.items.every((i) => i.vendorId === order.items[0].vendorId)
      ? order.items[0]
      : null;
  return {
    'Order ID': order.id,
    Customer: order.customer.name,
    Vendor: singleVendorItem?.vendorNameSnapshot ?? order.vendorNameSnapshot,
    Branch: singleVendorItem?.branchNameSnapshot ?? order.branchNameSnapshot,
    Composition: describeOrderComposition(order),
    Type: order.type,
    Item: order.items.map((i) => i.itemName).join(', ') || '—',
    Amount: `₹${order.total}`,
    'Payment Status': latestPayment?.status ?? '—',
    'Order Status': order.status,
    'Created At': new Date(order.createdAt).toLocaleString(),
    'Customer Phone': order.customer.phone ?? '—',
    'Customer Email': order.customer.email ?? '—',
    'Branch Address': [order.branch.address, order.branch.city].filter(Boolean).join(', ') || '—',
    Subtotal: `₹${order.subtotal}`,
    Quantity: order.items.reduce((n, i) => n + i.quantity, 0),
    'Payment Provider': latestPayment?.provider ?? '—',
    'Payment Failure Reason': latestPayment?.failureReason ?? '—',
    'Cancellation Reason': order.cancellationReason ?? '—',
  };
}

interface TableParams {
  page: number;
  pageSize: number;
  search: string;
  filter: string;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10, search: '', filter: '' };

/** One list serves both audiences: an admin sees every order, a vendor caller is force-scoped
 *  server-side to its own vendor (order.service.ts#listOrders) — no second vendor-only page. */
export function OrderManagement() {
  const { token, can } = useAuth();
  const canChangeStatus = can('orders', 'status_change');

  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);

  const [statusOrder, setStatusOrder] = useState<Order | null>(null);
  const [statusValue, setStatusValue] = useState<OrderStatus | ''>('');
  const [statusError, setStatusError] = useState('');
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const statusDialogRef = useRef<MdDialog>(null);

  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listOrders(token, {
        page: params.page,
        pageSize: params.pageSize,
        status: (params.filter || undefined) as OrderStatus | undefined,
        search: params.search || undefined,
      });
      setOrders(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load orders.');
    } finally {
      setLoading(false);
    }
  }, [token, params]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => JSON.stringify(orders.map(toOrderRow)), [orders]);

  const actions = useMemo(
    () =>
      JSON.stringify([
        { icon: 'visibility', label: 'View', event: '__view_detail__' },
        ...(canChangeStatus ? [{ icon: 'sync_alt', label: 'Change status', event: 'change-status' }] : []),
      ]),
    [canChangeStatus],
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
      if (detail.action !== 'change-status') return;
      const order = orders.find((o) => o.id === detail.row['Order ID']);
      if (order) openStatusDialog(order);
    };

    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
  }, [orders, openStatusDialog]);

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

  return (
    <div className="admin-page admin-page--wide">
      <title>Orders · MSD</title>
      <header className="page-head">
        <div>
          <h1>Orders</h1>
          <p>Every order from the marketplace catalogue — Deal, Product, and Therapist alike.</p>
        </div>
      </header>

      {error && <p className="error-state" role="alert">{error}</p>}

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
        search-placeholder="Search by customer, vendor, branch, or item…"
        filter-label="Order Status"
        filter-options={ORDER_FILTERS}
        actions={actions}
      />

      <Dialog ref={statusDialogRef} onClose={() => setStatusOrder(null)}>
        <div slot="headline">Change order status</div>
        <div slot="content" className="form-grid">
          {statusOrder && (
            <>
              <p className="field-hint">
                Order {statusOrder.id} · currently {statusOrder.status}
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
