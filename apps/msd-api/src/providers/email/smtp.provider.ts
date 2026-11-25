import { createConnection, type Socket } from 'node:net';
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
type SmtpTransportOptions = import('nodemailer/lib/smtp-transport').Options;
type SmtpGetSocket = NonNullable<SmtpTransportOptions['getSocket']>;

const CONNECTION_TIMEOUT_MS = 15000;
const GREETING_TIMEOUT_MS = 10000;
const SOCKET_TIMEOUT_MS = 20000;

/** Nodemailer 9 has no transport `family` option; Node's socket API does. */
const getIpv4Socket: SmtpGetSocket = (options, callback) => {
  let socket: Socket;
  try {
    socket = createConnection({
      host: options.host ?? env.smtpHost,
      port: options.port ?? env.smtpPort,
      family: 4,
    });
  } catch (error) {
    callback(error as Error, {});
    return;
  }

  let settled = false;
  const finish = (error: Error | null, socketOptions: object) => {
    if (settled) return;
    settled = true;
    clearTimeout(connectionTimer);
    socket.removeListener('connect', onConnect);
    socket.removeListener('error', onError);
    callback(error, socketOptions);
  };
  const onConnect = () => finish(null, { connection: socket });
  const onError = (error: Error) => finish(error, {});
  const connectionTimer = setTimeout(() => {
    socket.destroy(new Error(`SMTP IPv4 connection timed out after ${CONNECTION_TIMEOUT_MS}ms`));
  }, CONNECTION_TIMEOUT_MS);

  socket.once('connect', onConnect);
  socket.once('error', onError);
};

function safeErrorMessage(error: unknown, secrets: string[] = []): string {
  const message = error instanceof Error ? error.message : String(error);
  return secrets.filter(Boolean).reduce((safe, secret) => safe.split(secret).join('[redacted]'), message);
}


function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;

  const transportOptions: SmtpTransportOptions = {
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,

    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: GREETING_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
    getSocket: getIpv4Socket,

    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  };

  cachedTransporter = nodemailer.createTransport(transportOptions);

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
      `[email:smtp] request FAILED to=${maskEmail(to)} durationMs=${durationMs} error=${safeErrorMessage(err, [env.smtpUser, env.smtpPass, otp])}`,
    );
    return false;
  }
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  return `${user.slice(0, 2)}***@${domain}`;
}

/** Sends a plain text transactional email. Returns true only once SMTP accepted it. */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const missing = REQUIRED_ENV.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    console.error(`[email:smtp] cannot send, missing env var(s): ${missing.join(', ')}`);
    return false;
  }
  try {
    const info = await getTransporter().sendMail({ from: env.emailFrom, to, subject, text });
    console.info(`[email:smtp] sent to=${maskEmail(to)} messageId=${info.messageId}`);
    return true;
  } catch (err) {
    console.error(`[email:smtp] request FAILED to=${maskEmail(to)} error=${safeErrorMessage(err, [env.smtpUser, env.smtpPass])}`);
    return false;
  }
}
