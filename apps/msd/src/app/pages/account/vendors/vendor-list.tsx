import { useEffect, useMemo, useRef, type RefObject } from 'react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import type { Vendor } from '../../../../api/rbac/vendors';

interface VendorTableParams {
  page: number;
  pageSize: number;
  search: string;
}

interface VendorListProps {
  vendors: Vendor[];
  selectedId: string | null;
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
  APPROVED: 'success',
  ACTIVE: 'success',
  PENDING_VERIFICATION: 'warning',
  PROFILE_INCOMPLETE: 'warning',
  REJECTED: 'error',
  SUSPENDED: 'error',
  INACTIVE: 'error',
};

const KYC_STATUS_MAP: Record<string, 'success' | 'warning' | 'error'> = {
  VERIFIED: 'success',
  PENDING: 'warning',
  REJECTED: 'error',
};

const VENDOR_COLUMNS = JSON.stringify([
  { key: 'Business Name', label: 'Business Name' },
  { key: 'Owner', label: 'Owner' },
  { key: 'Contact', label: 'Contact' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: VENDOR_STATUS_MAP },
  { key: 'KYC Status', label: 'KYC Status', type: 'status', statusMap: KYC_STATUS_MAP },
  { key: 'Branch Count', label: 'Branch Count' },
]);

/** Not '__view_detail__' — the real "detail view" for a vendor is the existing right-hand
 *  pipeline/profile panel in vendors.tsx (AdminVendorManagement), not the generic drawer. */
const VENDOR_ACTIONS = JSON.stringify([{ icon: 'chevron_right', label: 'Select', event: 'select' }]);

/** Flat row for <sky-data-table> — 'Vendor ID' is an extra (non-column) key used only to look
 *  the vendor back up on the 'select' row action; it is not one of the visible columns. */
function toVendorRow(vendor: Vendor): Record<string, string | number> {
  return {
    'Vendor ID': vendor.id,
    'Business Name': vendor.businessName || vendor.owner?.name || 'Draft vendor (onboarding in progress)',
    Owner: vendor.owner?.name ?? '—',
    Contact: vendor.businessPhone || vendor.ownerMobile || '—',
    Status: vendor.status,
    'KYC Status': vendor.kycStatus,
    'Branch Count': vendor._count?.branches ?? 0,
  };
}

/** Left-hand vendor picker for the admin surface — sky-data-table pattern, mirrors
 *  orders.tsx exactly (ref + sky-dt-params-change + sky-dt-row-action).
 *  Presenter-only: pagination/search state and the actual `listVendors` fetch stay owned by
 *  the parent (AdminVendorManagement in vendors.tsx); this component only renders and forwards
 *  table events. `selectedId` is accepted for API-contract parity with the previous
 *  hand-rolled list but sky-data-table has no non-checkbox "current row" highlight concept, so
 *  it is intentionally unused here — consistent with Order's table, not a regression. */
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
      caption="Vendors"
      columns={VENDOR_COLUMNS}
      rows={rows}
      total={total}
      page={page}
      page-size={pageSize}
      loading={loading}
      searchable
      search-placeholder="Search vendors…"
      actions={VENDOR_ACTIONS}
    />
  );
}

export default VendorList;
