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
