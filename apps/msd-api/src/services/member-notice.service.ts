import { sendEmail } from '../providers/email/smtp.provider';
import { sendTextSms } from '../providers/sms/connectExpress.provider';
import { reactivatedMessage, suspendedMessage, welcomeMessage } from '../lib/member-messages';

export type MemberNoticeKind = 'WELCOME' | 'SUSPENDED' | 'REACTIVATED';

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
