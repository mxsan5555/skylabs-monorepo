import { sendEmail } from '../providers/email/smtp.provider';
import { sendTextSms } from '../providers/sms/connectExpress.provider';
import { reactivatedMessage, suspendedMessage, welcomeMessage } from '../lib/member-messages';

export type MemberNoticeKind = 'WELCOME' | 'SUSPENDED' | 'REACTIVATED';

export interface MemberNoticeTarget {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
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

/** One inline retry. A durable retry queue arrives with the reminder job slice. */
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

/** Never throws. The caller records the result; a failed send must not undo a status change. */
export async function sendMemberNotice(
  kind: MemberNoticeKind,
  target: MemberNoticeTarget,
  reason?: string | null,
): Promise<MemberNoticeResult> {
  const { subject, text } = build(kind, target, reason);
  const email = target.email ? await attempt(() => sendEmail(target.email as string, subject, text)) : null;
  const sms = target.phone ? await attempt(() => sendTextSms(target.phone as string, text)) : null;
  return { email, sms };
}
