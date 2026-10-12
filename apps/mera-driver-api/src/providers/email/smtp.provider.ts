import nodemailer, { type Transporter } from 'nodemailer';
import { createHash } from 'node:crypto';
import { HttpError } from '../../middleware/errorHandler';
import { otpDeliveryError, transportFailure } from '../otp-delivery-error';

/**
 * Real SMTP email delivery for OTPs — no mock path. `EMAIL_FROM` is read fresh on every
 * send (not cached at module load) so a corrected `.env.local` takes effect without a
 * process restart during setup.
 */
let cachedTransporter: Transporter | null = null;
let cachedTransportKey = '';

function getTransporter(host: string, port: number, user: string, pass: string): Transporter {
  const key = createHash('sha256').update(JSON.stringify([host,port,user,pass])).digest('hex');
  if (cachedTransporter && cachedTransportKey === key) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });
  cachedTransportKey = key;
  return cachedTransporter;
}

export async function sendOtpEmail(to: string, otp: string): Promise<boolean> {
  const host = process.env.SMTP_HOST ?? '';
  const port = Number(process.env.SMTP_PORT ?? '');
  const user = process.env.SMTP_USER ?? '';
  const pass = process.env.SMTP_PASS ?? '';
  const from = process.env.EMAIL_FROM ?? '';

  const missing = [
    !host && 'SMTP_HOST',
    (!Number.isInteger(port) || port < 1 || port > 65535) && 'SMTP_PORT',
    !user && 'SMTP_USER',
    !pass && 'SMTP_PASS',
    !from && 'EMAIL_FROM',
  ].filter((v): v is string => !!v);

  if (missing.length > 0) {
    console.error(`[email:smtp] cannot send — missing env var(s): ${missing.join(', ')}`);
    throw otpDeliveryError('Email', 'configuration');
  }

  const transporter = getTransporter(host, port, user, pass);
  const startedAt = Date.now();
  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: 'Your login OTP',
      text: `Your OTP is ${otp}. It expires shortly — do not share it with anyone.`,
    });
    const durationMs = Date.now() - startedAt;
    const accepted = (info.accepted ?? []).some((address: string | {address:string}) => (typeof address === 'string' ? address : address.address).toLowerCase() === to.toLowerCase());
    if (!accepted) throw otpDeliveryError('Email', 'rejected');
    console.info(
      `[email:smtp] accepted durationMs=${durationMs}`,
    );
    return true;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    if (err instanceof HttpError) throw err;
    const failure = transportFailure((err as {code?:string})?.code);
    console.error(
      `[email:smtp] FAILED durationMs=${durationMs} failure=${failure}`,
    );
    throw otpDeliveryError('Email', failure);
  }
}
