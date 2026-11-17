import { sendEmail } from '../providers/email/smtp.provider';
import { sendTextSms } from '../providers/sms/connectExpress.provider';
import { prisma } from '../lib/prisma';
import { permissionKeyFor } from '@skylabs-monorepo/shared-permissions';
import {
  archivedMessage,
  inactiveMessage,
  reactivatedMessage,
  restoredMessage,
  suspendedMessage,
  welcomeMessage,
} from '../lib/member-messages';

export type MemberNoticeKind = 'WELCOME' | 'SUSPENDED' | 'REACTIVATED' | 'INACTIVE' | 'ARCHIVED' | 'RESTORED';

export interface MemberNoticeTarget {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** Prisma select for the member owner fields a notice needs. */
export const NOTICE_OWNER_SELECT = { select: { name: true, email: true, phone: true } } as const;

/** Member notices go to the owner's own login email and phone. */
export function noticeTargetOf(owner: MemberNoticeTarget | null | undefined): MemberNoticeTarget {
  return { name: owner?.name, email: owner?.email, phone: owner?.phone };
}

export interface MemberNoticeResult {
  /** null when the member has no email on record. */
  email: boolean | null;
  /** null when the member has no phone on record. */
  sms: boolean | null;
}

function build(kind: MemberNoticeKind, target: MemberNoticeTarget, reason?: string | null) {
  if (kind === 'SUSPENDED') return { subject: 'Your MSD member account is suspended', text: suspendedMessage(reason ?? null) };
  if (kind === 'REACTIVATED') return { subject: 'Your MSD member account is active again', text: reactivatedMessage() };
  if (kind === 'INACTIVE') return { subject: 'Your MSD member account is inactive', text: inactiveMessage(reason ?? null) };
  if (kind === 'ARCHIVED') return { subject: 'Your MSD member account is archived', text: archivedMessage(reason ?? null) };
  if (kind === 'RESTORED') return { subject: 'Your MSD member account is restored', text: restoredMessage() };
  return { subject: 'Welcome to MSD', text: welcomeMessage(target.name) };
}

export type NoticeChannel = 'email' | 'sms';

/** The channels a target can be reached on, in send order. */
export function noticeChannels(target: MemberNoticeTarget): NoticeChannel[] {
  return [...(target.email ? (['email'] as const) : []), ...(target.phone ? (['sms'] as const) : [])];
}

/** One inline retry. Documents reminders also retry across job runs (member-reminder.service.ts). */
async function attempt(send: () => Promise<boolean>): Promise<boolean> {
  for (let i = 0; i < 2; i += 1) {
    try {
      if (await send()) return true;
    } catch (err) {
      console.error({ err, context: 'member notice send threw' });
    }
  }
  return false;
}

/** Sends one text on one channel. Never throws; false when the channel has no address or failed. */
export function sendOnChannel(channel: NoticeChannel, target: MemberNoticeTarget, subject: string, text: string): Promise<boolean> {
  if (channel === 'email') return target.email ? attempt(() => sendEmail(target.email as string, subject, text)) : Promise.resolve(false);
  return target.phone ? attempt(() => sendTextSms(target.phone as string, text)) : Promise.resolve(false);
}

/** Never throws. The caller records the result; a failed send must not undo a status change. */
export async function sendMemberNotice(
  kind: MemberNoticeKind,
  target: MemberNoticeTarget,
  reason?: string | null,
): Promise<MemberNoticeResult> {
  const { subject, text } = build(kind, target, reason);
  const email = target.email ? await sendOnChannel('email', target, subject, text) : null;
  const sms = target.phone ? await sendOnChannel('sms', target, subject, text) : null;
  return { email, sms };
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
  ARCHIVED: 'Archived (deleted)',
};

export interface AdminStatusNotice {
  businessName: string | null;
  from: string;
  to: string;
  reason: string | null;
}

/**
 * Emails every active staff user who can change member statuses (`members:status_change`, or a
 * Super Admin role) that a member's status changed (item 6). Recipients come from the permission
 * matrix, never a role name. Never throws; returns how many emails went out.
 */
export async function sendAdminStatusNotice(notice: AdminStatusNotice): Promise<number> {
  const key = permissionKeyFor('members', 'status_change');
  const admins = await prisma.user.findMany({
    where: {
      status: 'active',
      deletedAt: null,
      email: { not: null },
      roles: { some: { role: { isActive: true, OR: [{ isSuperAdmin: true }, { permissions: { some: { permission: { key } } } }] } } },
    },
    select: { name: true, email: true },
  });
  const who = notice.businessName?.trim() || 'A member';
  const subject = `Member status changed: ${who} is now ${STATUS_LABEL[notice.to] ?? notice.to}`;
  const text =
    `${who} moved from ${STATUS_LABEL[notice.from] ?? notice.from} to ${STATUS_LABEL[notice.to] ?? notice.to}. ` +
    `Reason: ${notice.reason?.trim() || 'not recorded'}.`;
  const sent = await Promise.all(admins.map((admin) => sendOnChannel('email', admin, subject, text)));
  return sent.filter(Boolean).length;
}
