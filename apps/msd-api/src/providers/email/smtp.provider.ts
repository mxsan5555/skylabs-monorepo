import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env';

/**
 * Real SMTP email delivery for OTPs — no mock path. Mirrors `providers/sms/
 * connectExpress.provider.ts`'s shape: read config, validate presence (reporting exactly
 * which var is missing, never guessing), send, log every attempt without ever logging the
 * credentials themselves.
 */

const REQUIRED_ENV: Array<[name: string, value: string]> = [
  ['SMTP_HOST', env.smtpHost],
  ['SMTP_USER', env.smtpUser],
  ['SMTP_PASS', env.smtpPass],
  ['EMAIL_FROM', env.emailFrom],
];

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: { user: env.smtpUser, pass: env.smtpPass },
  });
  return cachedTransporter;
}

/**
 * Sends an OTP email via SMTP. Returns `true` only once the SMTP server has accepted the
 * message for delivery; every attempt (success or failure) is logged with timing and the
 * provider's response, but never the SMTP credentials.
 */
export async function sendOtpEmail(to: string, otp: string): Promise<boolean> {
  const missing = REQUIRED_ENV.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    console.error(`[email:smtp] cannot send — missing env var(s): ${missing.join(', ')}`);
    return false;
  }

  const startedAt = Date.now();
  try {
    const info = await getTransporter().sendMail({
      from: env.emailFrom,
      to,
      subject: 'Your login OTP',
      text: `Your OTP is ${otp}. It expires in ${env.otpExpiryMinutes} minutes — do not share it with anyone.`,
    });
    const durationMs = Date.now() - startedAt;
    console.info(
      `[email:smtp] sent to=${maskEmail(to)} durationMs=${durationMs} messageId=${info.messageId} response=${info.response}`,
    );
    return true;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    console.error(
      `[email:smtp] request FAILED to=${maskEmail(to)} durationMs=${durationMs} error=${(err as Error).message}`,
    );
    return false;
  }
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  return `${user.slice(0, 2)}***@${domain}`;
}
