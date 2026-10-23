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
    path.join(__dirname, '../../.env'), // fallback for checked-in local dev env files
    path.join(process.cwd(), 'apps/msd-api/.env.local'), // run from workspace root
    path.join(process.cwd(), 'apps/msd-api/.env'), // run from workspace root with fallback file
    path.join(process.cwd(), '.env.local'), // run from apps/msd-api itself
    path.join(process.cwd(), '.env'), // run from apps/msd-api itself with fallback file
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
  /** Rolling session length: every successful refresh re-issues a new session for this long
   *  from "now" (see token.service.ts#rotateRefreshToken calling issueRefreshSession again),
   *  so a user active at least once every 60 days never has to re-enter an OTP. */
  jwtRefreshTtlDays: optionalInt('JWT_REFRESH_TTL_DAYS', 60),

  otpExpiryMinutes: optionalInt('OTP_EXPIRY_MINUTES', 10),
  otpMaxAttempts: optionalInt('OTP_MAX_ATTEMPTS', 5),
  otpRequestRateLimitPer10Min: optionalInt('OTP_REQUEST_RATE_LIMIT_PER_10_MIN', 5),
  /** OTP sends per identifier per hour, from any IP (stops IP rotation buying fresh codes). */
  otpIdentifierRateLimitPerHour: optionalInt('OTP_IDENTIFIER_RATE_LIMIT_PER_HOUR', 10),
  /** Proxies in front of the API (Railway: 1). 0 locally, so a client cannot fake its IP. */
  trustProxyHops: optionalInt('TRUST_PROXY_HOPS', 0),
  /** Swagger UI at /docs: on outside production, off in production unless API_DOCS=true. */
  apiDocsEnabled: process.env.API_DOCS === 'true' || process.env.NODE_ENV !== 'production',

  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  /** Shown to a suspended member so they know how to get their account back. */
  supportEmail: process.env.SUPPORT_EMAIL ?? '',
  supportPhone: process.env.SUPPORT_PHONE ?? '',
  /** 32 bytes, base64. Encrypts full Aadhaar and PAN numbers at rest. Optional in development. */
  fieldEncryptionKey: process.env.FIELD_ENCRYPTION_KEY ?? '',
  /** Shared with the Railway cron service; guards `/internal/jobs/*`. Unset disables the jobs (503). */
  cronSecret: process.env.CRON_SECRET ?? '',
  /** Secret mixed into the document number hash used for the duplicate check. */
  docHashPepper: process.env.DOC_HASH_PEPPER ?? '',
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

  // Media storage (Deal/Product/Therapist/Vendor/Category/CMS images+video) → Cloudflare R2
  // (S3-compatible object storage). Optional here — validated at first upload by lib/media-storage
  // (the S3 client is constructed lazily), same "optional here, needed at use time" rationale as
  // the SMS/SMTP/Razorpay vars above. `R2_PUBLIC_BASE_URL` is the frontend's concern
  // (VITE_MEDIA_BASE_URL), not the API's — the API only needs the four upload credentials.
  r2AccountId: process.env.R2_ACCOUNT_ID ?? '',
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  r2Bucket: process.env.R2_BUCKET ?? '',
  /** Private bucket for member KYC documents (no public access). Uploads fail until it is set. */
  r2PrivateBucket: process.env.R2_PRIVATE_BUCKET ?? '',
  r2PublicUrl: process.env.R2_PUBLIC_URL ?? '',
};
