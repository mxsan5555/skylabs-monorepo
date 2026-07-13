import nodemailer from 'nodemailer';
import { env } from '../env';

const transporter = env.smtpHost
  ? nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
    })
  : null;

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const subject = 'Your sign-in code';
  const text = `Your sign-in code is ${code}. It expires shortly and can only be used once.`;

  if (!transporter) {
    if (env.isProduction) throw new Error('SMTP is not configured');
    // Dev fallback so the OTP flow is testable without a real mailbox — never reached in prod.
    console.log(`[dev] OTP email to ${to}: ${code}`);
    return;
  }

  await transporter.sendMail({ from: env.emailFrom, to, subject, text });
}
