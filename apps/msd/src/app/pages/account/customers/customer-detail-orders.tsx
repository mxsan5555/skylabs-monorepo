import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { listOrders, type Order } from '../../../../api/rbac/orders';
import { ApiRequestError } from '../../../../api/rbac/client';

const ORDER_COLUMNS = JSON.stringify([
  { key: 'Order ID', label: 'Order ID', width: '110px' },
  { key: 'Vendor', label: 'Vendor' },
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

/** Flat row for <sky-data-table> — same shape as the Vendor Detail "Orders" tab, minus the
 *  now-redundant "Customer" column (every row on this tab already belongs to the one selected
 *  customer) and with "Vendor" restored (a customer can order from many vendors). */
function toOrderRow(order: Order): Record<string, string | number> {
  const latestPayment = order.payments.length
    ? [...order.payments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : null;
  return {
    'Order ID': order.id,
    Vendor: order.vendorNameSnapshot,
    Branch: order.branchNameSnapshot,
    Type: order.type,
    Item: order.items.map((i) => i.itemName).join(', ') || '—',
    Amount: `₹${order.total}`,
    'Payment Status': latestPayment?.status ?? '—',
    'Order Status': order.status,
    'Created At': new Date(order.createdAt).toLocaleString(),
    'Payment Provider': latestPayment?.provider ?? '—',
    'Payment Failure Reason': latestPayment?.failureReason ?? '—',
    'Cancellation Reason': order.cancellationReason ?? '—',
  };
}

interface TableParams {
  page: number;
  pageSize: number;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10 };

/** SuperAdmin "Orders" tab on the Customer Detail page — this one customer's order history,
 *  reusing the existing admin Orders API client (`listOrders`) with its admin-only `customerId`
 *  filter. Read-only — full order management already lives on `/account/orders`. */
export function CustomerDetailOrders({ token, customerId }: { token: string | null; customerId: string }) {
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
      const { data, meta } = await listOrders(token, { page: params.page, pageSize: params.pageSize, customerId });
      setOrders(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load orders for this customer.');
    } finally {
      setLoading(false);
    }
  }, [token, customerId, params]);

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

export default CustomerDetailOrders;
