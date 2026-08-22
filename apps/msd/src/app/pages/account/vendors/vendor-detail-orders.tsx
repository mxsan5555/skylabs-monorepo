import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { listOrders, type Order } from '../../../../api/rbac/orders';
import { ApiRequestError } from '../../../../api/rbac/client';

const ORDER_COLUMNS = JSON.stringify([
  { key: 'Order ID', label: 'Order ID', width: '110px' },
  { key: 'Customer', label: 'Customer' },
  { key: 'Branch', label: 'Branch' },
  { key: 'Type', label: 'Type' },
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

const ORDER_ACTIONS = JSON.stringify([{ icon: 'visibility', label: 'View', event: '__view_detail__' }]);

/** Flat row for <sky-data-table> — same shape as orders.tsx's admin list, minus the now-redundant
 *  "Vendor" column (every row on this tab already belongs to the one selected vendor). */
function toOrderRow(order: Order): Record<string, string | number> {
  const latestPayment = order.payments.length
    ? [...order.payments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : null;
  return {
    'Order ID': order.id,
    Customer: order.customer.name,
    Branch: order.branchNameSnapshot,
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
    'Booking Date': order.booking?.bookingDate ? new Date(order.booking.bookingDate).toLocaleDateString() : '—',
    'Booking Time Slot': order.booking?.timeSlot ?? '—',
    'Booking Status': order.booking?.status ?? '—',
  };
}

interface TableParams {
  page: number;
  pageSize: number;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10 };

/** Admin "Orders" tab on the Vendor Detail page (vendors.tsx) — this one vendor's order history
 *  in context, reusing the existing admin Orders API client (`listOrders`) with its admin-only
 *  `vendorId` filter (see `ListOrdersOpts` in `api/rbac/orders.ts` — a vendor caller is
 *  force-scoped server-side regardless, but an admin caller's `vendorId` narrows the result).
 *  Read-only: full order management (search, status filter, status-change) already lives on the
 *  dedicated `/account/orders` page — this tab is scoped viewing only, so no status-change
 *  dialog/action here, just the table's own built-in "view detail" drawer. */
export function VendorDetailOrders({ token, vendorId }: { token: string | null; vendorId: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);

  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listOrders(token, { page: params.page, pageSize: params.pageSize, vendorId });
      setOrders(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load orders for this vendor.');
    } finally {
      setLoading(false);
    }
  }, [token, vendorId, params]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => JSON.stringify(orders.map(toOrderRow)), [orders]);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    const onParamsChange = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      setParams({ page: detail.page, pageSize: detail.pageSize });
    };

    el.addEventListener('sky-dt-params-change', onParamsChange);
    return () => el.removeEventListener('sky-dt-params-change', onParamsChange);
  }, []);

  return (
    <>
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
        actions={ORDER_ACTIONS}
      />
    </>
  );
}

export default VendorDetailOrders;
