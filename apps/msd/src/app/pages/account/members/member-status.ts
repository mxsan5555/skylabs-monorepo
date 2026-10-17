import type { MemberStatus, Vendor, VendorDocumentType } from '../../../../api/rbac/vendors';

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
  ARCHIVED: 'Archived',
};

export const MEMBER_DOCUMENT_LABEL: Record<VendorDocumentType, string> = {
  AADHAAR: 'Aadhaar card',
  PAN: 'PAN card',
  GST: 'GST number',
};

const STATUS_SUMMARY = /^Status changed from ([A-Z_]+) to ([A-Z_]+)(.*)$/;
const DOCUMENT_SUMMARY = /^([A-Z_]+) document (.*)$/;

const isStatus = (value: string): value is MemberStatus => value in MEMBER_STATUS_LABEL;
const isDocumentType = (value: string): value is VendorDocumentType => value in MEMBER_DOCUMENT_LABEL;

/**
 * Makes an activity summary readable. msd-api (`member-activity.service.ts`) writes two fixed
 * templates with raw enums: "Status changed from ACTIVE to SUSPENDED[ by Name]" and
 * "AADHAAR document uploaded[ by staff for the member]" / "... approved" / "... rejected". Only a
 * known enum at the start of one of those templates is swapped for its label; anything else,
 * including the rest of the sentence, stays exactly as the server sent it.
 */
export function readableActivitySummary(summary: string): string {
  const status = STATUS_SUMMARY.exec(summary);
  if (status) {
    const [, from, to, rest] = status;
    return isStatus(from) && isStatus(to) ? `Status changed from ${MEMBER_STATUS_LABEL[from]} to ${MEMBER_STATUS_LABEL[to]}${rest}` : summary;
  }
  const document = DOCUMENT_SUMMARY.exec(summary);
  if (document) {
    const [, type, rest] = document;
    return isDocumentType(type) ? `${MEMBER_DOCUMENT_LABEL[type]} ${rest}` : summary;
  }
  return summary;
}

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
