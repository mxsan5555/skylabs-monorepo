import * as dotenv from 'dotenv';

// Nx executors run with cwd = workspace root, so this path is stable regardless
// of where webpack emits the built bundle (unlike a `__dirname`-relative path).
dotenv.config({ path: 'apps/msd-api/.env.local' });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4300),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  otpTtlSeconds: Number(process.env.OTP_TTL_SECONDS ?? 300),
  otpResendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS ?? 30),
  otpMaxAttempts: Number(process.env.OTP_MAX_ATTEMPTS ?? 5),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL ?? '',
  frontendUrl: required('FRONTEND_URL'),
  smtpHost: process.env.SMTP_HOST ?? '',
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPass: process.env.SMTP_PASS ?? '',
  emailFrom: process.env.EMAIL_FROM ?? 'no-reply@example.com',
  smsApiUrl: process.env.SMS_API_URL ?? 'https://connectexpress.in/api/v3/',
  smsApiKey: process.env.SMS_API_KEY ?? '',
  smsSender: process.env.SMS_SENDER ?? '',
  isProduction: process.env.NODE_ENV === 'production',
};
