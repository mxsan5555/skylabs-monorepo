import { useEffect, useMemo, useRef, type RefObject } from 'react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import type { Vendor } from '../../../../api/rbac/vendors';
import { formatCount } from './vendor-setup';

interface VendorTableParams {
  page: number;
  pageSize: number;
  search: string;
}

interface VendorListProps {
  vendors: Vendor[];
  /** Called with the vendor id when a row's "Open" action is used. The parent navigates. */
  onSelect: (id: string) => void;
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  /** Fired on every sky-dt-params-change — the parent (AdminVendorManagement) owns the actual
   *  fetch and drives `listVendors(token, {page, pageSize, search})` from this. */
  onParamsChange: (params: VendorTableParams) => void;
}

/** Maps Vendor.status → sky-badge variant. Same grouping the old status-pill used:
 *  APPROVED/ACTIVE read as "good", PENDING_VERIFICATION/PROFILE_INCOMPLETE as "in progress",
 *  REJECTED/SUSPENDED/INACTIVE as "bad". */
const VENDOR_STATUS_MAP: Record<string, 'success' | 'warning' | 'error'> = {
  'Approved': 'success',
  'Active': 'success',
  'Waiting for approval': 'warning',
  'Profile incomplete': 'warning',
  'Rejected': 'error',
  'Suspended': 'error',
  'Inactive': 'error',
};

const STATUS_LABEL: Record<string, string> = {
  APPROVED: 'Approved',
  ACTIVE: 'Active',
  PENDING_VERIFICATION: 'Waiting for approval',
  PROFILE_INCOMPLETE: 'Profile incomplete',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
  INACTIVE: 'Inactive',
};

/** Counts read "5 of 18" when only some items are live, "18" when all are. */
const VENDOR_COLUMNS = JSON.stringify([
  { key: 'Business Name', label: 'Business' },
  { key: 'Owner', label: 'Owner' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: VENDOR_STATUS_MAP },
  { key: 'Branch Count', label: 'Branches' },
  { key: 'Deal Count', label: 'Deals' },
  { key: 'Therapist Count', label: 'Therapists' },
  { key: 'Product Count', label: 'Products' },
]);

/** The row action opens the member's own page (`/account/vendors/:id`). */
const VENDOR_ACTIONS = JSON.stringify([{ icon: 'chevron_right', label: 'Open member', event: 'select' }]);

/** Flat row for <sky-data-table> — 'Vendor ID' is an extra (non-column) key used only to look
 *  the vendor back up on the 'select' row action; it is not one of the visible columns. */
function toVendorRow(vendor: Vendor): Record<string, string | number> {
  const live = vendor.liveCounts;
  const all = vendor._count;
  return {
    'Vendor ID': vendor.id,
    'Business Name': vendor.businessName || vendor.owner?.name || 'Draft member (setup in progress)',
    Owner: vendor.owner?.name ?? '—',
    Status: STATUS_LABEL[vendor.status] ?? vendor.status,
    'Branch Count': formatCount(live?.branches, all?.branches),
    'Deal Count': formatCount(live?.deals, all?.deals),
    'Therapist Count': formatCount(live?.therapists, all?.therapists),
    'Product Count': formatCount(live?.products, all?.products),
  };
}

/** Member list — sky-data-table pattern, mirrors orders.tsx (ref + sky-dt-params-change +
 *  sky-dt-row-action). Presenter-only: pagination/search state and the `listVendors` fetch stay
 *  owned by the parent (AdminVendorManagement in vendors.tsx). */
export function VendorList({ vendors, onSelect, total, page, pageSize, loading, onParamsChange }: VendorListProps) {
  const tableRef = useRef<HTMLElement>(null);
  const rows = useMemo(() => JSON.stringify(vendors.map(toVendorRow)), [vendors]);

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
      const id = detail.row['Vendor ID'];
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
      caption="Member"
      columns={VENDOR_COLUMNS}
      rows={rows}
      total={total}
      page={page}
      page-size={pageSize}
      loading={loading}
      searchable
      search-placeholder="Search members…"
      actions={VENDOR_ACTIONS}
    />
  );
}

export default VendorList;
