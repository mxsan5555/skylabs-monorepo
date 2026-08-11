import type { Vendor } from '../../../../api/rbac/vendors';

interface VendorListProps {
  vendors: Vendor[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const STATUS_LABEL: Record<Vendor['status'], string> = {
  PROFILE_INCOMPLETE: 'Incomplete',
  PENDING_VERIFICATION: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
};

const ACTIVE_STATUSES = new Set<Vendor['status']>(['APPROVED', 'ACTIVE']);

/** Left-hand vendor picker for the admin surface — mirrors role-list.tsx/user-list.tsx. */
export function VendorList({ vendors, selectedId, onSelect }: VendorListProps) {
  if (vendors.length === 0) {
    return <p className="empty-state">No vendors yet. Create one to get started.</p>;
  }

  return (
    <ul className="entity-list">
      {vendors.map((vendor) => (
        <li key={vendor.id}>
          <button
            type="button"
            className={`entity-list__item${vendor.id === selectedId ? ' active' : ''}`}
            onClick={() => onSelect(vendor.id)}
            aria-current={vendor.id === selectedId ? 'true' : undefined}
          >
            <span className="role-list__name">
              {vendor.businessName || vendor.owner?.name || 'Draft vendor (onboarding in progress)'}
              {vendor._count && (
                <span className="field-hint"> · {vendor._count.branches} branch{vendor._count.branches === 1 ? '' : 'es'}</span>
              )}
            </span>
            <span className={`status-pill ${ACTIVE_STATUSES.has(vendor.status) ? 'status-pill--active' : 'status-pill--inactive'}`}>
              {STATUS_LABEL[vendor.status]}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
