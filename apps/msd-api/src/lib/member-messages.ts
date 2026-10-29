import { env } from '../config/env';
import { documentTypeList, type DocumentTypeKey } from './document-number';
import { BUSINESS_TIME_ZONE, REMINDER_COUNT } from '../services/member-reminder-policy';

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

/** Notice when an admin makes a member inactive (item 6). */
export function inactiveMessage(reason: string | null): string {
  return (
    `Your member account is now inactive. Reason: ${reason?.trim() || 'not recorded'}. ` +
    `You can still log in and view everything, but you cannot make changes and your listings are hidden from the website. ${contactLine()} to reactivate it.`
  );
}

/** Notice when a suspended member is deleted: archived, never erased (item 6, Q2). */
export function archivedMessage(reason: string | null): string {
  return (
    `Your member account has been closed and archived. Reason: ${reason?.trim() || 'not recorded'}. ` +
    `Your records are kept. ${contactLine()} if you want to come back.`
  );
}

/** Notice when an archived member is restored to inactive (item 6). */
export function restoredMessage(): string {
  return (
    'Your member account has been restored. It is inactive for now: you can log in and view everything, ' +
    'and our team will reactivate it once your details are confirmed.'
  );
}

export function inactiveReadOnlyMessage(): string {
  return 'Your member account is inactive and view only. You can look at your orders, customers, branches, deals, therapists and products, but you cannot change anything. Please contact our support team to reactivate it.';
}

export function welcomeMessage(name: string | null | undefined): string {
  const who = name?.trim() ? `, ${name.trim()}` : '';
  return `Welcome to MSD${who}. Your member account is ready. Log in with this mobile number or email address using a one-time password.`;
}

/** Activity and notification wording for the flag set after the final warning. */
export const REVIEW_FLAG_SUMMARY = 'Flagged as ready for suspension review';

export interface DocumentsReminderInput {
  /** 1 to REMINDER_COUNT for a scheduled warning; null for a manual "Remind now". */
  sequence: number | null;
  missing: readonly DocumentTypeKey[];
  dueAt: Date | null;
}

function formatDueDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: BUSINESS_TIME_ZONE });
}

export function isFinalWarning(sequence: number | null): boolean {
  return sequence === REMINDER_COUNT;
}

export function documentsReminderSubject(sequence: number | null): string {
  return isFinalWarning(sequence) ? 'Final reminder: upload your MSD member documents' : 'Reminder: upload your MSD member documents';
}

/** One text for the email and the SMS. Lists the exact documents still needed. */
export function documentsReminderMessage({ sequence, missing, dueAt }: DocumentsReminderInput): string {
  const step = sequence === null ? 'Reminder' : `Reminder ${sequence} of ${REMINDER_COUNT}`;
  const due = dueAt ? ` They were due on ${formatDueDate(dueAt)}.` : '';
  const final = isFinalWarning(sequence) ? ' This is the final reminder. If they are not received, an admin may suspend your account.' : '';
  return `${step}: please upload your missing member documents: ${documentTypeList(missing)}.${due}${final} ${contactLine()} if you need help.`;
}
