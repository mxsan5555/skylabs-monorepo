import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listMyCustomers, type CustomerRow } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';

const CUSTOMER_COLUMNS = JSON.stringify([
  { key: 'Name', label: 'Name' },
  { key: 'Phone', label: 'Phone' },
  { key: 'Email', label: 'Email' },
  { key: 'Orders', label: 'Orders' },
  { key: 'Last Activity', label: 'Last Activity' },
]);

const CUSTOMER_ACTIONS = JSON.stringify([{ icon: 'visibility', label: 'View', event: '__view_detail__' }]);

/** Flat row for <sky-data-table> — response is already flat with no nested objects, so the
 *  table's built-in `__view_detail__` action (Object.entries(row) drawer) is enough; no
 *  separate detail dialog needed. */
function toCustomerRow(customer: CustomerRow): Record<string, string | number> {
  return {
    Name: customer.name || '—',
    Phone: customer.phone || '—',
    Email: customer.email || '—',
    Orders: customer.orderCount,
    'Last Activity': new Date(customer.lastActivityAt).toLocaleDateString(),
  };
}

interface TableParams {
  page: number;
  pageSize: number;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 20 };

/** Vendor self-service "Customers" page — everyone who has ordered from the logged-in vendor,
 *  resolved server-side from the JWT (`GET /vendors/me/customers`, gated
 *  `vendors:custom` — the same permission every other vendor self-service route already
 *  uses). The backend doesn't support a search param on this endpoint, so `searchable` is
 *  intentionally omitted rather than inventing a new query param. */
export function VendorCustomers() {
  const { token } = useAuth();
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
      const { data, meta } = await listMyCustomers(token, { page: params.page, pageSize: params.pageSize });
      setCustomers(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load your customers.');
    } finally {
      setLoading(false);
    }
  }, [token, params]);

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
    <div className="admin-page admin-page--wide">
      <title>Customers · MSD</title>
      <header className="page-head">
        <div>
          <h1>Customers</h1>
          <p>Everyone who has ordered from or booked with your business.</p>
        </div>
      </header>

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
    </div>
  );
}

export default VendorCustomers;
