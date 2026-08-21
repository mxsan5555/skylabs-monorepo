import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Loaded once, first thing, before any other module reads process.env.
// apps/msd-api/.env.local is never committed (see .gitignore); .env.example documents the shape.
//
// This intentionally does NOT rely on `__dirname` alone: under the Nx/webpack production
// build everything is bundled into a single dist/apps/msd-api/main.js, which changes
// __dirname's depth relative to the source tree. Try a couple of likely locations instead,
// and never override already-set process.env vars (real deploys inject secrets via the
// platform/CI, not this file — see .env.example).
if (process.env.NODE_ENV !== 'production') {
  const candidates = [
    path.join(__dirname, '../../.env.local'), // unbundled dev (src/config -> apps/msd-api)
    path.join(process.cwd(), 'apps/msd-api/.env.local'), // run from workspace root
    path.join(process.cwd(), '.env.local'), // run from apps/msd-api itself
  ];
  const envFile = candidates.find((p) => fs.existsSync(p));
  if (envFile) dotenv.config({ path: envFile });
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: optionalInt('PORT', 3333),

  databaseUrl: required('DATABASE_URL'),

  jwtSecret: required('JWT_SECRET'),
  jwtAccessTtlMinutes: optionalInt('JWT_ACCESS_TTL_MINUTES', 15),
  jwtRefreshTtlDays: optionalInt('JWT_REFRESH_TTL_DAYS', 30),

  otpExpiryMinutes: optionalInt('OTP_EXPIRY_MINUTES', 10),
  otpMaxAttempts: optionalInt('OTP_MAX_ATTEMPTS', 5),
  otpRequestRateLimitPer10Min: optionalInt('OTP_REQUEST_RATE_LIMIT_PER_10_MIN', 5),

  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  googleCallbackUrl:
    process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:3333/api/v1/auth/google/callback',

  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:4200')
    .split(',')
    .map((s) => s.trim()),

  // SMS OTP delivery (ConnectExpress). Intentionally optional here — the OTP flow also
  // serves email identifiers, which don't need these — the provider itself validates
  // presence at send time and reports exactly which var is missing.
  smsApiUrl: process.env.SMS_API_URL ?? '',
  smsApiKey: process.env.SMS_API_KEY ?? '',
  smsSender: process.env.SMS_SENDER ?? '',

  // Email OTP delivery (SMTP). Same "optional here, validated at send time" rationale as
  // the SMS vars above.
  smtpHost: process.env.SMTP_HOST ?? '',
  smtpPort: optionalInt('SMTP_PORT', 587),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPass: process.env.SMTP_PASS ?? '',
  emailFrom: process.env.EMAIL_FROM ?? '',

  // Razorpay (test mode). Same "optional here, validated at send time" rationale as SMS/SMTP —
  // payment.service.ts's Razorpay client construction is what actually requires these.
  razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',

  // Media upload system (Deal/Product/Therapist images+video). Local disk, relative to this
  // app's own directory by default — override for a persistent-volume mount in a real deploy.
  mediaUploadDir: process.env.MEDIA_UPLOAD_DIR ?? '',
};
