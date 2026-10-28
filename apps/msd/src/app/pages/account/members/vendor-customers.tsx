import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listMyCustomers, listVendorCustomersForAdmin, type CustomerRow } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';

const CUSTOMER_COLUMNS = JSON.stringify([
  { key: 'Name', label: 'Name' },
  { key: 'City', label: 'City' },
  { key: 'Phone', label: 'Phone' },
  { key: 'Email', label: 'Email' },
  { key: 'Orders', label: 'Orders' },
  { key: 'Last Activity', label: 'Last Activity' },
]);

const CUSTOMER_ACTIONS = JSON.stringify([{ icon: 'visibility', label: 'View', event: '__view_detail__' }]);

/** D19: the API withholds phone and email until the customer has an open order with you. */
const CONTACT_HIDDEN = 'Hidden until an order is open';

/** Flat row for <sky-data-table> — response is already flat with no nested objects, so the
 *  table's built-in `__view_detail__` action (Object.entries(row) drawer) is enough; no
 *  separate detail dialog needed. */
function toCustomerRow(customer: CustomerRow, showContact: boolean): Record<string, string | number> {
  const contact = (value: string | null) => (showContact || customer.hasOpenOrder ? value || '—' : CONTACT_HIDDEN);
  return {
    Name: customer.name || '—',
    City: customer.city || '—',
    Phone: contact(customer.phone),
    Email: contact(customer.email),
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
export function VendorCustomers({ vendorId }: { vendorId?: string } = {}) {
  const { token } = useAuth();
  /** Staff on a member's page (P10-49): the staff route, full contact details (D12), no page header. */
  const staffView = Boolean(vendorId);
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
      const paging = { page: params.page, pageSize: params.pageSize };
      const { data, meta } = vendorId ? await listVendorCustomersForAdmin(token, vendorId, paging) : await listMyCustomers(token, paging);
      setCustomers(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : staffView ? 'Could not load the customers.' : 'Could not load your customers.');
    } finally {
      setLoading(false);
    }
  }, [token, params, vendorId, staffView]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => JSON.stringify(customers.map((c) => toCustomerRow(c, staffView))), [customers, staffView]);

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

  const table = (
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

  // Inside the member page the tab supplies the heading and the page title.
  if (staffView) return table;

  return (
    <div className="admin-page admin-page--wide">
      <title>Customers · MSD</title>
      <header className="page-head">
        <div>
          <h1>Customers</h1>
          <p>Everyone who has ordered from or booked with your business. Phone and email show while a customer has an open order.</p>
        </div>
      </header>

      {table}
    </div>
  );
}

export default VendorCustomers;
