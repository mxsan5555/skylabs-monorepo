import { prisma } from '../lib/prisma';
import { documentTypeList } from '../lib/document-number';
import type { ReminderDelivery } from '../generated/prisma-client';
import { REMINDER_COUNT } from './member-reminder-policy';
import { REVIEW_FLAG_SUMMARY } from '../lib/member-messages';

export async function getStatusHistory(memberId: string) {
  const rows = await prisma.memberStatusHistory.findMany({
    where: { memberId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter((id): id is string => Boolean(id)))];
  const actors =
    actorIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      : [];
  const nameById = new Map(actors.map((a) => [a.id, a.name]));
  return rows.map((r) => ({
    id: r.id,
    fromStatus: r.fromStatus,
    toStatus: r.toStatus,
    reason: r.reason,
    actorUserId: r.actorUserId,
    actorName: r.actorUserId ? (nameById.get(r.actorUserId) ?? null) : null,
    createdAt: r.createdAt,
  }));
}

export interface ActivityItem {
  /** `detail` is the reason for status and document items, the documents asked for on reminders. */
  kind: 'status' | 'document' | 'reminder' | 'review';
  at: Date;
  summary: string;
  detail: string | null;
}

const CHANNEL_NAME = { email: 'email', sms: 'SMS' } as const;

function deliveredOn(emailStatus: ReminderDelivery | null, smsStatus: ReminderDelivery | null): string {
  const channels = [emailStatus === 'SENT' && CHANNEL_NAME.email, smsStatus === 'SENT' && CHANNEL_NAME.sms].filter(Boolean);
  return channels.join(' and ');
}

/** "Reminder 2 of 3 sent by email and SMS", "Manual reminder by Priya sent by email", "... could not be delivered". */
export function reminderSummary(row: {
  sequence: number | null;
  emailStatus: ReminderDelivery | null;
  smsStatus: ReminderDelivery | null;
  senderName?: string | null;
}): string {
  const what = row.sequence === null ? `Manual reminder${row.senderName ? ` by ${row.senderName}` : ''}` : `Reminder ${row.sequence} of ${REMINDER_COUNT}`;
  const on = deliveredOn(row.emailStatus, row.smsStatus);
  return on ? `${what} sent by ${on}` : `${what} could not be delivered`;
}

export async function getMemberActivity(memberId: string): Promise<ActivityItem[]> {
  const [history, docs, reminders, member] = await Promise.all([
    getStatusHistory(memberId),
    prisma.memberDocument.findMany({
      where: { vendorId: memberId },
      select: {
        documentType: true,
        status: true,
        createdAt: true,
        reviewedAt: true,
        rejectionReason: true,
        uploadedOnBehalf: true,
      },
    }),
    prisma.memberDocumentReminder.findMany({ where: { memberId }, orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.member.findUnique({ where: { id: memberId }, select: { reviewFlaggedAt: true } }),
  ]);
  const senderIds = [...new Set(reminders.map((r) => r.sentByUserId).filter((id): id is string => Boolean(id)))];
  const senders =
    senderIds.length > 0 ? await prisma.user.findMany({ where: { id: { in: senderIds } }, select: { id: true, name: true } }) : [];
  const senderName = new Map(senders.map((u) => [u.id, u.name]));

  const items: ActivityItem[] = history.map((h) => ({
    kind: 'status',
    at: h.createdAt,
    summary: `Status changed from ${h.fromStatus} to ${h.toStatus}${h.actorName ? ` by ${h.actorName}` : ''}`,
    detail: h.reason,
  }));

  for (const d of docs) {
    items.push({
      kind: 'document',
      at: d.createdAt,
      summary: `${d.documentType} document uploaded${d.uploadedOnBehalf ? ' by staff for the member' : ''}`,
      detail: null,
    });
    if (d.reviewedAt) {
      items.push({
        kind: 'document',
        at: d.reviewedAt,
        summary: `${d.documentType} document ${d.status === 'APPROVED' ? 'approved' : 'rejected'}`,
        detail: d.rejectionReason,
      });
    }
  }
  for (const r of reminders) {
    items.push({
      kind: 'reminder',
      at: r.sentAt ?? r.updatedAt,
      summary: reminderSummary({ ...r, senderName: r.sentByUserId ? senderName.get(r.sentByUserId) : null }),
      detail: documentTypeList(r.missingTypes),
    });
  }
  if (member?.reviewFlaggedAt) {
    items.push({ kind: 'review', at: member.reviewFlaggedAt, summary: REVIEW_FLAG_SUMMARY, detail: null });
  }
  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}
