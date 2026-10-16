import type { MemberStatus, Vendor } from '../../../../api/rbac/vendors';

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
  ARCHIVED: 'Archived',
};

export type BadgeVariant = 'primary' | 'secondary' | 'tertiary' | 'error';

export function statusBadgeVariant(status: MemberStatus): BadgeVariant {
  if (status === 'ACTIVE') return 'primary';
  if (status === 'INACTIVE') return 'tertiary';
  if (status === 'SUSPENDED') return 'error';
  return 'secondary';
}

type Summary = NonNullable<Vendor['documentsSummary']>;

export function documentsChipLabel(summary: Summary | undefined): string {
  return summary?.complete ? 'Documents complete' : 'Documents incomplete';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function dueDateLabel(summary: Summary | undefined): string {
  if (!summary || summary.complete || !summary.dueAt) return '';
  return `${summary.overdue ? 'Overdue since' : 'Due'} ${formatDate(summary.dueAt)}`;
}

export type StatusAction = 'deactivate' | 'suspend' | 'reactivate' | 'delete';

export function availableStatusActions(
  status: MemberStatus,
  can: { canStatusChange: boolean; canDelete: boolean },
): StatusAction[] {
  const actions: StatusAction[] = [];
  if (can.canStatusChange) {
    if (status === 'ACTIVE') actions.push('deactivate', 'suspend');
    if (status === 'INACTIVE') actions.push('reactivate', 'suspend');
    if (status === 'SUSPENDED') actions.push('reactivate');
  }
  if (can.canDelete && status === 'SUSPENDED') actions.push('delete');
  return actions;
}
