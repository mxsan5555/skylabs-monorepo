import { useEffect, useMemo, useRef, type RefObject } from 'react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import type { Customer, CustomerStatus } from '../../../../api/rbac/customers';

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
  /** `customers:status_change` — omit (or leave false) to hide the status-change row actions
   *  entirely; the 'View' action always shows. */
  canChangeStatus?: boolean;
  /** Fired when a status-change row action is clicked, already resolved to the target status
   *  and already guarded against a no-op (clicking "Activate" on an already-active row, etc. —
   *  see `_onRowAction` below). The parent (`customers.tsx`) owns the confirm dialog + API call. */
  onStatusChange: (id: string, status: CustomerStatus) => void;
}

/** DB enum stays `active | inactive | blocked` (do not rename) — the UI displays `blocked` as
 *  "Suspended". Used both for the table's Status cell and reused by `customers.tsx` for the
 *  detail panel's Status stat-card so the two never drift out of sync. */
const CUSTOMER_STATUS_LABEL: Record<CustomerStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  blocked: 'Suspended',
};

export function customerStatusLabel(status: CustomerStatus): string {
  return CUSTOMER_STATUS_LABEL[status] ?? status;
}

const CUSTOMER_STATUS_MAP: Record<string, 'success' | 'warning' | 'error'> = {
  Active: 'success',
  Inactive: 'warning',
  Suspended: 'error',
};

const CUSTOMER_COLUMNS = JSON.stringify([
  { key: 'Customer Name', label: 'Customer Name' },
  { key: 'Mobile', label: 'Mobile' },
  { key: 'Email', label: 'Email' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: CUSTOMER_STATUS_MAP },
  { key: 'Orders', label: 'Orders' },
  { key: 'Created At', label: 'Created At' },
]);

const CUSTOMER_VIEW_ACTION = { icon: 'chevron_right', label: 'View', event: 'select' };

/** sky-data-table's `actions` prop is one flat list rendered identically on every row (see
 *  `packages/shared-ui/src/components/sky-data-table/sky-data-table.ts` — no per-row action
 *  support), so all three status actions are always shown together rather than only the two
 *  non-current transitions; `_onRowAction` below guards against firing a no-op transition (e.g.
 *  clicking "Activate" on an already-active row) using the row's own current status. */
const CUSTOMER_STATUS_ACTIONS = [
  { icon: 'check_circle', label: 'Activate', event: 'activate' },
  { icon: 'pause_circle', label: 'Deactivate', event: 'deactivate' },
  { icon: 'block', label: 'Suspend', event: 'suspend' },
];

/** Row action event → the status it transitions the customer to. */
const ACTION_TARGET_STATUS: Record<string, CustomerStatus> = {
  activate: 'active',
  deactivate: 'inactive',
  suspend: 'blocked',
};

/** Flat row for <sky-data-table> — 'Customer ID' and 'Customer Status' are extra (non-column)
 *  keys used only by the row-action handler below (to look the customer back up, and to guard
 *  status-change no-ops against the row's real current status); they are not visible columns.
 *  'Status' itself is the display label ("Suspended", never "Blocked"/"blocked"). */
function toCustomerRow(customer: Customer): Record<string, string | number> {
  return {
    'Customer ID': customer.id,
    'Customer Status': customer.status,
    'Customer Name': customer.name,
    Mobile: customer.phone ?? '—',
    Email: customer.email ?? '—',
    Status: customerStatusLabel(customer.status),
    Orders: customer._count.orders,
    'Created At': new Date(customer.createdAt).toLocaleDateString(),
  };
}

/** Customer directory table — sky-data-table pattern, mirrors `vendor-list.tsx` exactly
 *  (ref + sky-dt-params-change + sky-dt-row-action). Presenter-only: pagination/search state
 *  and the actual `listCustomers` fetch stay owned by the parent (`customers.tsx`). */
export function CustomerList({
  customers,
  total,
  page,
  pageSize,
  loading,
  onSelect,
  onParamsChange,
  canChangeStatus = false,
  onStatusChange,
}: CustomerListProps) {
  const tableRef = useRef<HTMLElement>(null);
  const rows = useMemo(() => JSON.stringify(customers.map(toCustomerRow)), [customers]);
  const actions = useMemo(
    () => JSON.stringify(canChangeStatus ? [CUSTOMER_VIEW_ACTION, ...CUSTOMER_STATUS_ACTIONS] : [CUSTOMER_VIEW_ACTION]),
    [canChangeStatus],
  );

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    const onParams = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      onParamsChange({ page: detail.page, pageSize: detail.pageSize, search: detail.search });
    };
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; row: Record<string, unknown> }>).detail;
      const id = detail.row['Customer ID'];
      if (typeof id !== 'string' || !id) return;

      if (detail.action === 'select') {
        onSelect(id);
        return;
      }

      const targetStatus = ACTION_TARGET_STATUS[detail.action];
      if (!targetStatus) return;
      // Guard the no-op transition sky-data-table's uniform actions list can't hide up front
      // (e.g. "Activate" clicked on a row that's already active).
      if (detail.row['Customer Status'] === targetStatus) return;
      onStatusChange(id, targetStatus);
    };

    el.addEventListener('sky-dt-params-change', onParams);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParams);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
  }, [onParamsChange, onSelect, onStatusChange]);

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
      actions={actions}
    />
  );
}

export default CustomerList;
