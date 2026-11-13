import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useSearchParams } from 'react-router-dom';
import { OutlinedSelect, SelectOption, FilledButton } from '@skylabs-monorepo/shared-ui/react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  listCustomerPayments,
  exportCustomerPayments,
  type CustomerPaymentRow,
} from '../../../../api/rbac/accounts';
import { listVendors, type Vendor } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';

const COLUMNS = JSON.stringify([
  { key: 'Order', label: 'Order', width: '140px' },
  { key: 'Customer', label: 'Customer' },
  { key: 'Vendor', label: 'Vendor' },
  { key: 'Amount', label: 'Amount' },
  {
    key: 'Order Status',
    label: 'Order Status',
    type: 'status',
    statusMap: { PENDING_PAYMENT: 'warning', CONFIRMED: 'info', COMPLETED: 'success', CANCELLED: 'error' },
  },
  {
    key: 'Payment Status',
    label: 'Payment Status',
    type: 'status',
    statusMap: { CREATED: 'info', PAID: 'success', FAILED: 'error', CANCELLED: 'warning' },
  },
  { key: 'Payment Method', label: 'Payment Method' },
  { key: 'Created At', label: 'Created At' },
]);

function toRow(row: CustomerPaymentRow): Record<string, string | number> {
  return {
    Order: row.orderNumber,
    Customer: row.customerName,
    Vendor: row.vendorNameSnapshot,
    Amount: `₹${row.total}`,
    'Order Status': row.status,
    'Payment Status': row.latestPayment?.status ?? '—',
    'Payment Method': row.latestPayment?.provider ?? '—',
    'Created At': new Date(row.createdAt).toLocaleString(),
  };
}

interface TableParams {
  page: number;
  pageSize: number;
  search: string;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10, search: '' };

/** Super-Admin "Customer Payments" — the ledger view of every confirmed order's latest payment
 *  attempt, server-paginated via `GET /accounts/customer-payments`. A Vendor filter and CSV
 *  export (`accounts.customer-payments:export`) sit above the table — mirrors `orders.tsx`'s
 *  exact column/badge/pagination pattern per the approved plan. */
export function CustomerPaymentsPage() {
  const { token, can } = useAuth();
  const canExport = can('accounts.customer-payments', 'export');
  const [searchParams, setSearchParams] = useSearchParams();

  const [rows, setRows] = useState<CustomerPaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorId, setVendorId] = useState(searchParams.get('vendorId') ?? '');
  const [exporting, setExporting] = useState(false);

  const tableRef = useRef<HTMLElement>(null);

  useEffect(() => {
    listVendors(token, { pageSize: 200 }).then(({ data }) => setVendors(data)).catch(() => setVendors([]));
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listCustomerPayments(token, {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
        vendorId: vendorId || undefined,
      });
      setRows(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load customer payments.');
    } finally {
      setLoading(false);
    }
  }, [token, params, vendorId]);

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
    el.addEventListener('sky-dt-params-change', onParamsChange);
    return () => el.removeEventListener('sky-dt-params-change', onParamsChange);
  }, []);

  const onVendorFilterChange = (value: string) => {
    setVendorId(value);
    setSearchParams((prev) => {
      const usp = new URLSearchParams(prev);
      if (value) usp.set('vendorId', value);
      else usp.delete('vendorId');
      return usp;
    });
  };

  const doExport = async () => {
    setExporting(true);
    setError('');
    try {
      const blob = await exportCustomerPayments(token, { vendorId: vendorId || undefined, search: params.search || undefined });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'customer-payments.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Could not export customer payments.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="admin-page admin-page--wide">
      <title>Customer Payments · MSD</title>
      <header className="page-head">
        <div>
          <h1>Customer Payments</h1>
          <p>Every confirmed order's latest payment attempt.</p>
        </div>
        <div className="page-head__actions">
          {canExport && (
            <FilledButton onClick={doExport} disabled={exporting}>
              {exporting ? 'Exporting…' : 'Export CSV'}
            </FilledButton>
          )}
        </div>
      </header>

      <div className="form-grid" style={{ maxWidth: 320, marginBottom: 16 }}>
        <OutlinedSelect label="Vendor" value={vendorId} onChange={(e: Event) => onVendorFilterChange((e.target as HTMLSelectElement).value)}>
          <SelectOption value=""><div slot="headline">All vendors</div></SelectOption>
          {vendors.map((v) => (
            <SelectOption key={v.id} value={v.id}><div slot="headline">{v.businessName ?? v.id}</div></SelectOption>
          ))}
        </OutlinedSelect>
      </div>

      {error && <p className="error-state" role="alert">{error}</p>}

      <sky-data-table
        ref={tableRef as RefObject<HTMLElement>}
        caption="Customer Payments"
        columns={COLUMNS}
        rows={tableRows}
        total={total}
        page={params.page}
        page-size={params.pageSize}
        loading={loading}
        searchable
        search-placeholder="Search by order, customer, or vendor…"
      />
    </div>
  );
}

export default CustomerPaymentsPage;
