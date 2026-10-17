import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma, type ReminderDelivery, type VendorDocumentType } from '../generated/prisma-client';
import { documentsReminderMessage, documentsReminderSubject } from '../lib/member-messages';
import { documentsSummary, type DocumentsSummary } from './member-document.service';
import {
  NOTICE_OWNER_SELECT,
  noticeChannels,
  noticeTargetOf,
  sendOnChannel,
  type MemberNoticeTarget,
  type NoticeChannel,
} from './member-notice.service';
import { notifyPermissionHolders } from './notification.service';
import { writeAuditLog } from './audit.service';
import type { StatusActor } from './member-status.service';
import {
  isRemindable,
  isReviewDue,
  manualReminderBlockedUntil,
  MANUAL_REMINDER_COOLDOWN_HOURS,
  MAX_SEND_ATTEMPTS,
  nextWarning,
  REMINDABLE_STATUSES,
  REMINDER_COUNT,
  type DeliveredWarning,
} from './member-reminder-policy';

/**
 * Documents reminders (rules: `docs/msd/PLANNING.md` §2.4; design: `docs/msd/ARCHITECTURE.md` §2.3).
 * The daily job sends scheduled warnings 1 to 3, retries failed channels, flags members for
 * suspension review and clears the flag once documents are complete. Admins send manual
 * reminders. The system never changes a member's status.
 */

const BATCH_SIZE = 200;
/** Who may act on a flagged member, so who hears about it. */
const REVIEW_PERMISSION = { menuKey: 'members', action: 'status_change' } as const;
const OPEN_STATUSES: ReadonlySet<ReminderDelivery | null> = new Set(['PENDING', 'FAILED']);
const STATUS_FIELD: Record<NoticeChannel, 'emailStatus' | 'smsStatus'> = { email: 'emailStatus', sms: 'smsStatus' };

const REMINDER_MEMBER_SELECT = {
  id: true,
  status: true,
  businessName: true,
  documentsDueAt: true,
  reviewFlaggedAt: true,
  owner: NOTICE_OWNER_SELECT,
  documents: { select: { documentType: true, status: true } },
  documentReminders: { where: { sequence: { not: null } }, orderBy: { sequence: 'asc' } },
} satisfies Prisma.MemberSelect;

type ReminderMember = Prisma.MemberGetPayload<{ select: typeof REMINDER_MEMBER_SELECT }>;
type ReminderRow = ReminderMember['documentReminders'][number];

export interface ReminderRunSummary {
  checked: number;
  sent: number;
  failed: number;
  flagged: number;
  cleared: number;
}

export interface ManualReminderResult {
  emailStatus: ReminderDelivery | null;
  smsStatus: ReminderDelivery | null;
  sentAt: Date | null;
}

/** Documents a reminder asks for: missing ones plus rejected or expired ones to replace. */
function stillNeeded(summary: DocumentsSummary): VendorDocumentType[] {
  return [...summary.missing, ...summary.rejected];
}

function initialStatuses(target: MemberNoticeTarget) {
  return { emailStatus: target.email ? 'PENDING' : null, smsStatus: target.phone ? 'PENDING' : null } as const;
}

function delivered(rows: readonly ReminderRow[]): DeliveredWarning[] {
  return rows.flatMap((row) => (row.sequence !== null && row.sentAt ? [{ sequence: row.sequence, sentAt: row.sentAt }] : []));
}

function hasOpenChannel(row: ReminderRow): boolean {
  return OPEN_STATUSES.has(row.emailStatus) || OPEN_STATUSES.has(row.smsStatus);
}

function needsRetry(row: ReminderRow): boolean {
  return row.attempts < MAX_SEND_ATTEMPTS && hasOpenChannel(row);
}

/** Takes one attempt on the row. False when another run claimed it first. */
async function claim(row: ReminderRow): Promise<boolean> {
  const { count } = await prisma.memberDocumentReminder.updateMany({
    where: { id: row.id, attempts: row.attempts },
    data: { attempts: { increment: 1 } },
  });
  return count === 1;
}

/** Sends every open channel once and records each result. Never throws for a provider failure. */
async function deliver(row: ReminderRow, target: MemberNoticeTarget, dueAt: Date | null, now: Date): Promise<ReminderRow> {
  const subject = documentsReminderSubject(row.sequence);
  const text = documentsReminderMessage({ sequence: row.sequence, missing: row.missingTypes, dueAt });
  const next = { emailStatus: row.emailStatus, smsStatus: row.smsStatus };
  for (const channel of noticeChannels(target)) {
    const field = STATUS_FIELD[channel];
    if (!OPEN_STATUSES.has(next[field])) continue;
    next[field] = (await sendOnChannel(channel, target, subject, text)) ? 'SENT' : 'FAILED';
  }
  const anySent = next.emailStatus === 'SENT' || next.smsStatus === 'SENT';
  return prisma.memberDocumentReminder.update({
    where: { id: row.id },
    data: { ...next, sentAt: row.sentAt ?? (anySent ? now : null) },
  });
}

/** Null when a concurrent run created the same warning first (unique member + sequence). */
async function createWarning(member: ReminderMember, sequence: number, needed: VendorDocumentType[], target: MemberNoticeTarget) {
  try {
    return await prisma.memberDocumentReminder.create({
      data: { memberId: member.id, sequence, missingTypes: needed, ...initialStatuses(target) },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
    throw err;
  }
}

async function flagForReview(member: ReminderMember, now: Date): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.member.updateMany({ where: { id: member.id, reviewFlaggedAt: null }, data: { reviewFlaggedAt: now } });
    if (count === 0) return false;
    await notifyPermissionHolders(tx, REVIEW_PERMISSION, {
      type: 'MEMBER_REVIEW_FLAGGED',
      title: 'Member ready for suspension review',
      message: `${member.businessName || 'A member'} has not completed their documents after ${REMINDER_COUNT} reminders.`,
      entityType: 'MEMBER',
      entityId: member.id,
    });
    return true;
  });
}

async function clearReviewFlag(memberId: string): Promise<boolean> {
  const { count } = await prisma.member.updateMany({ where: { id: memberId, reviewFlaggedAt: { not: null } }, data: { reviewFlaggedAt: null } });
  return count === 1;
}

async function processMember(member: ReminderMember, now: Date, summary: ReminderRunSummary): Promise<void> {
  const docs = documentsSummary(member.documents, member.documentsDueAt, now);
  if (docs.complete) {
    if (member.reviewFlaggedAt && (await clearReviewFlag(member.id))) summary.cleared += 1;
    return;
  }
  if (!member.documentsDueAt) return;

  const target = noticeTargetOf(member.owner);
  const rows = [...member.documentReminders];
  const sequence = nextWarning(member.documentsDueAt, delivered(rows), now);
  // A warning with an undelivered channel goes first; a new warning waits for the next run.
  const row = rows.find(needsRetry) ?? (sequence === null ? null : await createWarning(member, sequence, stillNeeded(docs), target));

  if (row && (await claim(row))) {
    const result = await deliver(row, target, member.documentsDueAt, now);
    if (result.sentAt && !row.sentAt) summary.sent += 1;
    if (!result.sentAt) summary.failed += 1;
    const index = rows.findIndex((r) => r.id === result.id);
    if (index >= 0) rows[index] = result;
    else rows.push(result);
  }

  if (!member.reviewFlaggedAt && isReviewDue(delivered(rows), now) && (await flagForReview(member, now))) {
    summary.flagged += 1;
  }
}

/** One pass over every remindable member whose documents are due. Safe to run twice. */
export async function runDocumentReminders(now: Date = new Date()): Promise<ReminderRunSummary> {
  const summary: ReminderRunSummary = { checked: 0, sent: 0, failed: 0, flagged: 0, cleared: 0 };
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.member.findMany({
      where: { status: { in: [...REMINDABLE_STATUSES] }, documentsDueAt: { lte: now } },
      select: REMINDER_MEMBER_SELECT,
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const member of batch) {
      summary.checked += 1;
      try {
        await processMember(member, now, summary);
      } catch (err) {
        summary.failed += 1;
        console.error({ err, context: 'document reminder failed', memberId: member.id });
      }
    }
    if (batch.length < BATCH_SIZE) break;
    cursor = batch[batch.length - 1].id;
  }
  return summary;
}

/** "Remind now": one manual reminder, outside the schedule, at most once per cooldown window. */
export async function sendManualReminder(memberId: string, actor: StatusActor, now: Date = new Date()): Promise<ManualReminderResult> {
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: REMINDER_MEMBER_SELECT });
  if (!member) throw new ApiError('NOT_FOUND', 'Member not found');
  if (!isRemindable(member.status)) throw new ApiError('CONFLICT', 'Reminders go to active or inactive members only.');
  const docs = documentsSummary(member.documents, member.documentsDueAt, now);
  if (docs.complete) throw new ApiError('CONFLICT', 'This member has provided every document.');
  const target = noticeTargetOf(member.owner);
  if (noticeChannels(target).length === 0) throw new ApiError('CONFLICT', 'This member has no email or phone on record.');

  const last = await prisma.memberDocumentReminder.findFirst({
    where: { memberId, sequence: null },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (manualReminderBlockedUntil(last?.createdAt ?? null, now)) {
    throw new ApiError('RATE_LIMITED', `A reminder already went to this member in the last ${MANUAL_REMINDER_COOLDOWN_HOURS} hours.`);
  }

  const row = await prisma.memberDocumentReminder.create({
    data: { memberId, sequence: null, missingTypes: stillNeeded(docs), sentByUserId: actor.userId, attempts: 1, ...initialStatuses(target) },
  });
  const result = await deliver(row, target, member.documentsDueAt, now);
  await writeAuditLog({
    actorUserId: actor.userId,
    action: 'member.reminder.sent',
    targetType: 'Member',
    targetId: memberId,
    after: { emailStatus: result.emailStatus, smsStatus: result.smsStatus },
    ip: actor.ip,
    userAgent: actor.userAgent,
  });
  return { emailStatus: result.emailStatus, smsStatus: result.smsStatus, sentAt: result.sentAt };
}
