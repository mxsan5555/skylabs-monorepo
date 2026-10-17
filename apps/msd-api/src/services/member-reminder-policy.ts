import type { MemberStatus } from '../generated/prisma-client';

/**
 * The member documents timeline, in one place (spec `docs/msd/ADMIN_USER_ROLES_AND_PERMISSIONS.md`
 * section 4, decisions in `docs/superpowers/specs/2026-10-17-member-document-reminders-design.md`):
 * documents are due 14 days after the member is created, then 3 warnings one week apart, then the
 * member is flagged "Ready for suspension review" one week after the final warning (day 35).
 * Everything here is pure, so the timeline is tested with a fake clock.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const DOCUMENTS_DUE_DAYS = 14;
export const REMINDER_INTERVAL_DAYS = 7;
export const REMINDER_COUNT = 3;
/** D4: the final warning promises a week, so the flag waits one interval after it. */
export const REVIEW_FLAG_AFTER_FINAL_DAYS = REMINDER_INTERVAL_DAYS;
export const MAX_SEND_ATTEMPTS = 5;
export const MANUAL_REMINDER_COOLDOWN_HOURS = 24;
/** Suspended and archived members cannot log in, so they get no reminders. */
export const REMINDABLE_STATUSES: readonly MemberStatus[] = ['ACTIVE', 'INACTIVE'];
/** Dates in member messages read in the business's own time zone. */
export const BUSINESS_TIME_ZONE = 'Asia/Kolkata';

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

export function documentsDueAt(createdAt: Date): Date {
  return addDays(createdAt, DOCUMENTS_DUE_DAYS);
}

export function isRemindable(status: MemberStatus): boolean {
  return REMINDABLE_STATUSES.includes(status);
}

/** A scheduled warning that reached the member on at least one channel. */
export interface DeliveredWarning {
  sequence: number;
  sentAt: Date;
}

/**
 * The scheduled warning to send now, or null. Warning n is due `(n - 1)` intervals after the
 * documents due date and at least one interval after warning n - 1 actually went out, so a job
 * that missed days sends the next warning only, never two at once.
 */
export function nextWarning(dueAt: Date, delivered: readonly DeliveredWarning[], now: Date): number | null {
  const last = delivered.reduce<DeliveredWarning | null>((max, w) => (!max || w.sequence > max.sequence ? w : max), null);
  const next = (last?.sequence ?? 0) + 1;
  if (next > REMINDER_COUNT) return null;
  if (now < addDays(dueAt, (next - 1) * REMINDER_INTERVAL_DAYS)) return null;
  if (last && now < addDays(last.sentAt, REMINDER_INTERVAL_DAYS)) return null;
  return next;
}

/** True once the final warning went out and its promised week has passed. */
export function isReviewDue(delivered: readonly DeliveredWarning[], now: Date): boolean {
  const final = delivered.find((w) => w.sequence === REMINDER_COUNT);
  return Boolean(final && now >= addDays(final.sentAt, REVIEW_FLAG_AFTER_FINAL_DAYS));
}

/** When the next manual reminder is allowed, or null when it is allowed now. */
export function manualReminderBlockedUntil(lastManualAt: Date | null, now: Date): Date | null {
  if (!lastManualAt) return null;
  const until = new Date(lastManualAt.getTime() + MANUAL_REMINDER_COOLDOWN_HOURS * 60 * 60 * 1000);
  return now < until ? until : null;
}
