import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Real SMTP email delivery for OTPs — no mock path. `EMAIL_FROM` is read fresh on every
 * send (not cached at module load) so a corrected `.env.local` takes effect without a
 * process restart during setup.
 */
let cachedTransporter: Transporter | null = null;
let cachedTransportKey = '';

function getTransporter(host: string, port: number, user: string, pass: string): Transporter {
  const key = `${host}:${port}:${user}`;
  if (cachedTransporter && cachedTransportKey === key) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
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
    !port && 'SMTP_PORT',
    !user && 'SMTP_USER',
    !pass && 'SMTP_PASS',
    !from && 'EMAIL_FROM',
  ].filter((v): v is string => !!v);

  if (missing.length > 0) {
    console.error(`[email:smtp] cannot send — missing env var(s): ${missing.join(', ')}`);
    return false;
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
    console.info(
      `[email:smtp] sent to=${maskEmail(to)} durationMs=${durationMs} messageId=${info.messageId} response=${info.response}`,
    );
    return true;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    console.error(
      `[email:smtp] FAILED to=${maskEmail(to)} durationMs=${durationMs} error=${(err as Error).message}`,
    );
    return false;
  }
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  return `${user.slice(0, 2)}***@${domain}`;
}
