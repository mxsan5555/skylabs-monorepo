import { useEffect, useMemo, useRef, type RefObject } from 'react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import type { Customer } from '../../../../api/rbac/customers';

interface CustomerTableParams {
  page: number;
  pageSize: number;
  search: string;
}

interface CustomerListProps {
  customers: Customer[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  onSelect: (id: string) => void;
  /** Fired on every sky-dt-params-change — the parent owns the actual fetch and drives
   *  `listCustomers(token, {page, pageSize, search})` from this. */
  onParamsChange: (params: CustomerTableParams) => void;
}

const CUSTOMER_STATUS_MAP: Record<string, 'success' | 'warning' | 'error'> = {
  active: 'success',
  inactive: 'warning',
  blocked: 'error',
};

const CUSTOMER_COLUMNS = JSON.stringify([
  { key: 'Customer Name', label: 'Customer Name' },
  { key: 'Mobile', label: 'Mobile' },
  { key: 'Email', label: 'Email' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: CUSTOMER_STATUS_MAP },
  { key: 'Orders', label: 'Orders' },
  { key: 'Created At', label: 'Created At' },
]);

const CUSTOMER_ACTIONS = JSON.stringify([{ icon: 'chevron_right', label: 'View', event: 'select' }]);

/** Flat row for <sky-data-table> — 'Customer ID' is an extra (non-column) key used only to look
 *  the customer back up on the 'select' row action; it is not one of the visible columns. */
function toCustomerRow(customer: Customer): Record<string, string | number> {
  return {
    'Customer ID': customer.id,
    'Customer Name': customer.name,
    Mobile: customer.phone ?? '—',
    Email: customer.email ?? '—',
    Status: customer.status,
    Orders: customer._count.orders,
    'Created At': new Date(customer.createdAt).toLocaleDateString(),
  };
}

/** Customer directory table — sky-data-table pattern, mirrors `vendor-list.tsx` exactly
 *  (ref + sky-dt-params-change + sky-dt-row-action). Presenter-only: pagination/search state
 *  and the actual `listCustomers` fetch stay owned by the parent (`customers.tsx`). */
export function CustomerList({ customers, total, page, pageSize, loading, onSelect, onParamsChange }: CustomerListProps) {
  const tableRef = useRef<HTMLElement>(null);
  const rows = useMemo(() => JSON.stringify(customers.map(toCustomerRow)), [customers]);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    const onParams = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      onParamsChange({ page: detail.page, pageSize: detail.pageSize, search: detail.search });
    };
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; row: Record<string, unknown> }>).detail;
      if (detail.action !== 'select') return;
      const id = detail.row['Customer ID'];
      if (typeof id === 'string' && id) onSelect(id);
    };

    el.addEventListener('sky-dt-params-change', onParams);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParams);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
  }, [onParamsChange, onSelect]);

  return (
    <sky-data-table
      ref={tableRef as RefObject<HTMLElement>}
      caption="Customers"
      columns={CUSTOMER_COLUMNS}
      rows={rows}
      total={total}
      page={page}
      page-size={pageSize}
      loading={loading}
      searchable
      search-placeholder="Search customers…"
      actions={CUSTOMER_ACTIONS}
    />
  );
}

export default CustomerList;
