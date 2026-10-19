import { useEffect, useMemo, useRef, type RefObject } from 'react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import type { Vendor, VendorStatus } from '../../../../api/rbac/vendors';
import { formatCount } from './vendor-setup';

export interface VendorTableParams {
  page: number;
  pageSize: number;
  search: string;
  status: VendorStatus | '';
}

interface VendorListProps {
  vendors: Vendor[];
  /** Called with the vendor id when a row's "Open" action is used. The parent navigates. */
  onSelect: (id: string) => void;
  /** Called with the vendor id when a row's "Edit" action is used — opens the same member
   *  straight into the Business Details step. Omitted entirely (no Edit action/column button)
   *  when the caller lacks `vendors:edit`. */
  onEdit?: (id: string) => void;
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  /** Fired on every sky-dt-params-change — the parent (AdminVendorManagement) owns the actual
   *  fetch and drives `listVendors(token, {page, pageSize, search, status})` from this. */
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

const KYC_LABEL: Record<string, string> = { PENDING: 'KYC: Not checked yet', VERIFIED: 'KYC: Verified', REJECTED: 'KYC: Rejected' };

/** Filter options for the status column — reuses `<sky-data-table>`'s own built-in filter
 *  select (`filter-options`/`filter-label`), the same mechanism every other admin list in this
 *  app already has available, rather than a bespoke `ChipNav`. */
const STATUS_FILTER_OPTIONS = JSON.stringify(
  Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
);

const VENDOR_COLUMNS = JSON.stringify([
  { key: 'Business Name', label: 'Member / Contact', secondaryKey: 'Contact Detail' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: VENDOR_STATUS_MAP, secondaryKey: 'KYC Status' },
  { key: 'Branch Count', label: 'Branches' },
  { key: 'Deal Count', label: 'Deals' },
  { key: 'Product Count', label: 'Products' },
  { key: 'Therapist Count', label: 'Therapists' },
  { key: 'Created By', label: 'Created By', secondaryKey: 'Created Date' },
]);

/** Flat row for <sky-data-table> — 'Vendor ID' is an extra (non-column) key used only to look
 *  the vendor back up on a row action; it is not one of the visible columns. */
function toVendorRow(vendor: Vendor): Record<string, string | number> {
  const live = vendor.liveCounts;
  const all = vendor._count;
  const contactBits = [vendor.owner?.name, vendor.businessPhone || vendor.ownerMobile, vendor.city].filter(Boolean);
  return {
    'Vendor ID': vendor.id,
    'Business Name': vendor.businessName || vendor.owner?.name || 'Draft member (setup in progress)',
    'Contact Detail': contactBits.join(' · '),
    Status: STATUS_LABEL[vendor.status] ?? vendor.status,
    'KYC Status': KYC_LABEL[vendor.kycStatus] ?? vendor.kycStatus,
    'Branch Count': formatCount(live?.branches, all?.branches),
    'Deal Count': formatCount(live?.deals, all?.deals),
    'Product Count': formatCount(live?.products, all?.products),
    'Therapist Count': formatCount(live?.therapists, all?.therapists),
    'Created By': vendor.createdByName ?? 'Not recorded',
    'Created Date': new Date(vendor.createdAt).toLocaleDateString(),
  };
}

/** Member list — sky-data-table pattern, mirrors orders.tsx (ref + sky-dt-params-change +
 *  sky-dt-row-action). Presenter-only: pagination/search/status-filter state and the
 *  `listVendors` fetch stay owned by the parent (AdminVendorManagement in vendors.tsx). */
export function VendorList({ vendors, onSelect, onEdit, total, page, pageSize, loading, onParamsChange }: VendorListProps) {
  const tableRef = useRef<HTMLElement>(null);
  const rows = useMemo(() => JSON.stringify(vendors.map(toVendorRow)), [vendors]);
  const actions = useMemo(
    () =>
      JSON.stringify([
        { icon: 'chevron_right', label: 'Open member', event: 'select' },
        ...(onEdit ? [{ icon: 'edit', label: 'Edit member', event: 'edit' }] : []),
      ]),
    [onEdit],
  );

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    const onParams = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      onParamsChange({ page: detail.page, pageSize: detail.pageSize, search: detail.search, status: detail.filter as VendorStatus | '' });
    };
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; row: Record<string, unknown> }>).detail;
      const id = detail.row['Vendor ID'];
      if (typeof id !== 'string' || !id) return;
      if (detail.action === 'select') onSelect(id);
      else if (detail.action === 'edit') onEdit?.(id);
    };

    el.addEventListener('sky-dt-params-change', onParams);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParams);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
  }, [onParamsChange, onSelect, onEdit]);

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
      search-placeholder="Search by business, owner, mobile or creator…"
      filter-label="Status"
      filter-options={STATUS_FILTER_OPTIONS}
      actions={actions}
    />
  );
}

export default VendorList;
