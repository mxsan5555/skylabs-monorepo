import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { listOrders, type Order } from '../../../../api/rbac/orders';
import { ApiRequestError } from '../../../../api/rbac/client';
import { formatINR } from '../../../../utils/format';

const BASE_COLUMNS = [
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
];

const ORDER_COLUMNS = JSON.stringify(BASE_COLUMNS);

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
    Amount: formatINR(Number(order.total)),
    'Payment Status': latestPayment?.status ?? '—',
    'Order Status': order.status,
    'Created At': new Date(order.createdAt).toLocaleString(),
  };
}

interface TableParams {
  page: number;
  pageSize: number;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10 };

/**
 * SuperAdmin "Orders"/"Invoices" tab on the Customer Detail page — this one customer's order
 * history, reusing the existing admin Orders API client (`listOrders`) with its admin-only
 * `customerId` filter. Read-only — full order management already lives on `/account/orders`.
 *
 * `mode="invoices"` filters to `paymentStatus: 'PAID'` — an Order only ever reaches
 * CONFIRMED/COMPLETED via a verified payment (see msd-api's `payment.service.ts`), so a PAID
 * payment attempt is exactly "a real invoice exists for this order"; there is no separate
 * invoice-numbering system to reuse or invent (see `invoice-document.tsx`'s own doc comment).
 * Clicking "View"/"View Invoice" navigates to a real full page — never the generic raw-field
 * detail drawer `<sky-data-table>` would otherwise open for an unrecognised action.
 */
export function CustomerDetailOrders({
  token,
  customerId,
  mode = 'orders',
  onView,
}: {
  token: string | null;
  customerId: string;
  mode?: 'orders' | 'invoices';
  onView: (orderId: string) => void;
}) {
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
      const { data, meta } = await listOrders(token, {
        page: params.page,
        pageSize: params.pageSize,
        customerId,
        ...(mode === 'invoices' ? { paymentStatus: 'PAID' as const } : {}),
      });
      setOrders(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : `Could not load ${mode} for this customer.`);
    } finally {
      setLoading(false);
    }
  }, [token, customerId, params, mode]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => JSON.stringify(orders.map(toOrderRow)), [orders]);
  const actions = useMemo(
    () => JSON.stringify([{ icon: mode === 'invoices' ? 'receipt_long' : 'visibility', label: mode === 'invoices' ? 'View Invoice' : 'View', event: 'view' }]),
    [mode],
  );

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    const onParamsChange = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      setParams({ page: detail.page, pageSize: detail.pageSize });
    };
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; row: Record<string, unknown> }>).detail;
      const id = detail.row['Order ID'];
      if (detail.action === 'view' && typeof id === 'string' && id) onView(id);
    };

    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
  }, [onView]);

  return (
    <>
      {error && <p className="error-state" role="alert">{error}</p>}
      <sky-data-table
        ref={tableRef as RefObject<HTMLElement>}
        caption={mode === 'invoices' ? 'Invoices' : 'Orders'}
        columns={ORDER_COLUMNS}
        rows={rows}
        total={total}
        page={params.page}
        page-size={params.pageSize}
        loading={loading}
        actions={actions}
      />
      {mode === 'invoices' && !loading && orders.length === 0 && !error && (
        <p className="empty-state">No paid orders yet — an invoice only exists once an order's payment succeeds.</p>
      )}
    </>
  );
}

export default CustomerDetailOrders;
