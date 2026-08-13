import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { listVendorCustomersForAdmin, type CustomerRow } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';

const CUSTOMER_COLUMNS = JSON.stringify([
  { key: 'Name', label: 'Name' },
  { key: 'Phone', label: 'Phone' },
  { key: 'Email', label: 'Email' },
  { key: 'Orders', label: 'Orders' },
  { key: 'Bookings', label: 'Bookings' },
  { key: 'Last Activity', label: 'Last Activity' },
]);

const CUSTOMER_ACTIONS = JSON.stringify([{ icon: 'visibility', label: 'View', event: '__view_detail__' }]);

/** Flat row for <sky-data-table> — same shape as vendor-customers.tsx's self-service list, kept
 *  as a small local copy rather than a shared helper: the two call sites diverge only in which
 *  client function they call (`listMyCustomers` vs `listVendorCustomersForAdmin`), and
 *  extracting that alone isn't worth the indirection. */
function toCustomerRow(customer: CustomerRow): Record<string, string | number> {
  return {
    Name: customer.name || '—',
    Phone: customer.phone || '—',
    Email: customer.email || '—',
    Orders: customer.orderCount,
    Bookings: customer.bookingCount,
    'Last Activity': new Date(customer.lastActivityAt).toLocaleDateString(),
  };
}

interface TableParams {
  page: number;
  pageSize: number;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 20 };

/** Admin "Customers" tab on the Vendor Detail page (vendors.tsx) — everyone who has ordered
 *  from or booked with this ONE vendor, resolved from an explicit `vendorId`
 *  (`GET /vendors/:vendorId/customers`, gated `vendors:view` — the same permission that already
 *  guards this whole screen). Read-only: no row action beyond the table's own built-in
 *  "view detail" drawer. Like `vendor-customers.tsx`, the backend has no search param on this
 *  endpoint, so `searchable` is intentionally omitted. */
export function VendorDetailCustomers({ token, vendorId }: { token: string | null; vendorId: string }) {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);

  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listVendorCustomersForAdmin(token, vendorId, { page: params.page, pageSize: params.pageSize });
      setCustomers(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load customers for this vendor.');
    } finally {
      setLoading(false);
    }
  }, [token, vendorId, params]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => JSON.stringify(customers.map(toCustomerRow)), [customers]);

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
        caption="Customers"
        columns={CUSTOMER_COLUMNS}
        rows={rows}
        total={total}
        page={params.page}
        page-size={params.pageSize}
        loading={loading}
        actions={CUSTOMER_ACTIONS}
      />
    </>
  );
}

export default VendorDetailCustomers;
