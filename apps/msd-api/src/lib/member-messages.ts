import { env } from '../config/env';

function contactLine(): string {
  const parts: string[] = [];
  if (env.supportEmail) parts.push(`email ${env.supportEmail}`);
  if (env.supportPhone) parts.push(`call ${env.supportPhone}`);
  return parts.length > 0 ? `Please ${parts.join(' or ')}` : 'Please contact our support team';
}

/** One text for the login error, the email and the SMS, so a member always reads the same steps. */
export function suspendedMessage(reason: string | null): string {
  return (
    `Your member account is suspended. Reason: ${reason?.trim() || 'not recorded'}. ` +
    `${contactLine()}, resolve the reason above, and our team will reactivate your account.`
  );
}

export function reactivatedMessage(): string {
  return 'Your member account is active again. You can log in and manage your branches, deals, therapists and products.';
}

export function inactiveReadOnlyMessage(): string {
  return 'Your member account is inactive and view only. You can look at your orders, customers, branches, deals, therapists and products, but you cannot change anything. Please contact our support team to reactivate it.';
}

export function welcomeMessage(name: string | null | undefined): string {
  const who = name?.trim() ? `, ${name.trim()}` : '';
  return `Welcome to MSD${who}. Your member account is ready. Log in with this mobile number or email address using a one-time password.`;
}
