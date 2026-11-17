import { prisma } from '../lib/prisma';
import { documentTypeList } from '../lib/document-number';
import type { MemberStatus, ReminderDelivery, VendorDocumentType } from '../generated/prisma-client';
import { REMINDER_COUNT } from './member-reminder-policy';
import { REVIEW_FLAG_SUMMARY } from '../lib/member-messages';
import { userNamesById } from './user-names';

export async function getStatusHistory(memberId: string) {
  const rows = await prisma.memberStatusHistory.findMany({
    where: { memberId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const nameById = await userNamesById(rows.map((r) => r.actorUserId));
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

type ReminderChannel = 'email' | 'sms';

/** `summary` stays for older clients; new clients build their text from the typed fields
 *  (P3-24). `detail` is the reason for status and document items, the documents asked for on
 *  reminders. */
interface ActivityBase {
  at: Date;
  summary: string;
  detail: string | null;
}
export type ActivityItem =
  | (ActivityBase & { kind: 'status'; fromStatus: MemberStatus; toStatus: MemberStatus; actorId: string | null; actorName: string | null })
  | (ActivityBase & { kind: 'document'; documentType: VendorDocumentType; event: 'uploaded' | 'approved' | 'rejected'; byStaff: boolean })
  | (ActivityBase & { kind: 'reminder'; sequence: number | null; channels: ReminderChannel[]; actorId: string | null; actorName: string | null })
  | (ActivityBase & { kind: 'review' });

const CHANNEL_NAME: Record<ReminderChannel, string> = { email: 'email', sms: 'SMS' };

/** The channels that actually delivered, email first. */
function deliveredChannels(emailStatus: ReminderDelivery | null, smsStatus: ReminderDelivery | null): ReminderChannel[] {
  return [...(emailStatus === 'SENT' ? (['email'] as const) : []), ...(smsStatus === 'SENT' ? (['sms'] as const) : [])];
}

function deliveredOn(emailStatus: ReminderDelivery | null, smsStatus: ReminderDelivery | null): string {
  return deliveredChannels(emailStatus, smsStatus).map((c) => CHANNEL_NAME[c]).join(' and ');
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
  const senderName = await userNamesById(reminders.map((r) => r.sentByUserId));

  const items: ActivityItem[] = history.map((h) => ({
    kind: 'status',
    at: h.createdAt,
    summary: `Status changed from ${h.fromStatus} to ${h.toStatus}${h.actorName ? ` by ${h.actorName}` : ''}`,
    detail: h.reason,
    fromStatus: h.fromStatus,
    toStatus: h.toStatus,
    actorId: h.actorUserId,
    actorName: h.actorName,
  }));

  for (const d of docs) {
    items.push({
      kind: 'document',
      at: d.createdAt,
      summary: `${d.documentType} document uploaded${d.uploadedOnBehalf ? ' by staff for the member' : ''}`,
      detail: null,
      documentType: d.documentType,
      event: 'uploaded',
      byStaff: d.uploadedOnBehalf,
    });
    if (d.reviewedAt) {
      const event = d.status === 'APPROVED' ? 'approved' : 'rejected';
      items.push({
        kind: 'document',
        at: d.reviewedAt,
        summary: `${d.documentType} document ${event}`,
        detail: d.rejectionReason,
        documentType: d.documentType,
        event,
        byStaff: d.uploadedOnBehalf,
      });
    }
  }
  for (const r of reminders) {
    const actorName = r.sentByUserId ? (senderName.get(r.sentByUserId) ?? null) : null;
    items.push({
      kind: 'reminder',
      at: r.sentAt ?? r.updatedAt,
      summary: reminderSummary({ ...r, senderName: actorName }),
      detail: documentTypeList(r.missingTypes),
      sequence: r.sequence,
      channels: deliveredChannels(r.emailStatus, r.smsStatus),
      actorId: r.sentByUserId,
      actorName,
    });
  }
  if (member?.reviewFlaggedAt) {
    items.push({ kind: 'review', at: member.reviewFlaggedAt, summary: REVIEW_FLAG_SUMMARY, detail: null });
  }
  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}
