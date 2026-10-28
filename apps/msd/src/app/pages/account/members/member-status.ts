import type { SkyStatusTone } from '@skylabs-monorepo/shared-ui';
import type { MemberStatus, Vendor, VendorDocumentType } from '../../../../api/rbac/vendors';
import type { ActivityItem, ReminderResult } from '../../../../api/rbac/members';

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

const isStatus = (value: string | undefined): value is MemberStatus => !!value && value in MEMBER_STATUS_LABEL;
const isDocumentType = (value: string | undefined): value is VendorDocumentType => !!value && value in MEMBER_DOCUMENT_LABEL;

/**
 * The sentence for one activity row, built from its structured fields (P3-24) with the console's
 * own labels: "Status changed from Active to Suspended by Priya", "Aadhaar card uploaded by staff
 * for the member", "PAN card approved". Reminder and review rows, rows without fields and any
 * value this map does not know use the server's `summary` as sent.
 */
export function activityText(item: ActivityItem): string {
  if (item.kind === 'status' && isStatus(item.fromStatus) && isStatus(item.toStatus)) {
    const by = item.actorName ? ` by ${item.actorName}` : '';
    return `Status changed from ${MEMBER_STATUS_LABEL[item.fromStatus]} to ${MEMBER_STATUS_LABEL[item.toStatus]}${by}`;
  }
  if (item.kind === 'document' && isDocumentType(item.documentType) && item.event) {
    const byStaff = item.event === 'uploaded' && item.byStaff ? ' by staff for the member' : '';
    return `${MEMBER_DOCUMENT_LABEL[item.documentType]} ${item.event}${byStaff}`;
  }
  return item.summary;
}

/** Colour meaning of each lifecycle state (`sky-badge status`): live, paused, blocked, gone. */
export const MEMBER_STATUS_TONE: Record<MemberStatus, SkyStatusTone> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  SUSPENDED: 'error',
  ARCHIVED: 'neutral',
};

export const DOCUMENTS_LABEL = { complete: 'Documents complete', incomplete: 'Documents incomplete' } as const;

/** Incomplete documents are a compliance follow-up, not a block, so they read as a warning. */
export const DOCUMENTS_TONE: Record<keyof typeof DOCUMENTS_LABEL, SkyStatusTone> = {
  complete: 'success',
  incomplete: 'warning',
};

/** Set after the final documents warning (reminder job, P6-05); an admin then decides. */
export const REVIEW_FLAG_LABEL = 'Ready for suspension review';
export const REVIEW_FLAG_TONE: SkyStatusTone = 'error';
/** Suspend reason prefilled for a flagged member (spec section 4). */
export const REVIEW_FLAG_REASON = 'Documents not completed';

type Summary = NonNullable<Vendor['documentsSummary']>;

/** Mirrors msd-api `REMINDABLE_STATUSES`: suspended and archived members cannot log in. */
const REMINDABLE_STATUSES: readonly MemberStatus[] = ['ACTIVE', 'INACTIVE'];

/** "Remind now" makes sense only while documents are missing and the member can act on it. */
export function canBeReminded(status: MemberStatus, summary: Summary | undefined): boolean {
  return REMINDABLE_STATUSES.includes(status) && !summary?.complete;
}

export const REMIND_NOW_LABEL = 'Remind now';

const CHANNEL_LABEL = { email: 'email', sms: 'SMS' } as const;

/** Snackbar text for a "Remind now" result. */
export function reminderOutcome(result: ReminderResult): string {
  const channels = [result.emailStatus === 'SENT' && CHANNEL_LABEL.email, result.smsStatus === 'SENT' && CHANNEL_LABEL.sms].filter(Boolean);
  return channels.length > 0
    ? `Reminder sent by ${channels.join(' and ')}.`
    : 'The reminder could not be delivered. Check the email and phone on the profile.';
}

/** Label in front of an activity item's `detail`. */
export const ACTIVITY_DETAIL_LABEL: Record<ActivityItem['kind'], string> = {
  status: 'Reason',
  document: 'Reason',
  reminder: 'Documents asked for',
  review: 'Reason',
};

const documentsState = (summary: Summary | undefined) => (summary?.complete ? 'complete' : 'incomplete');

export function documentsChipLabel(summary: Summary | undefined): string {
  return DOCUMENTS_LABEL[documentsState(summary)];
}

export function documentsChipTone(summary: Summary | undefined): SkyStatusTone {
  return DOCUMENTS_TONE[documentsState(summary)];
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
