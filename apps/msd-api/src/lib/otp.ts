import { randomInt } from 'node:crypto';
import bcrypt from 'bcrypt';
import { OtpPurpose, type OtpChannel, type PrismaClient } from '../generated/prisma';
import { env } from '../env';

export type OtpErrorCode =
  | 'cooldown'
  | 'rate_limited'
  | 'invalid_or_expired_code'
  | 'too_many_attempts';

export class OtpError extends Error {
  constructor(
    public readonly code: OtpErrorCode,
    public readonly status: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}

// Anti-bombing cap on OTP requests per destination, independent of the resend cooldown.
const HOURLY_REQUEST_LIMIT = 5;

function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * Generates, hashes, and stores a new OTP for a destination, invalidating any
 * prior unconsumed code for the same destination+purpose so exactly one code
 * is ever live at a time. Returns the plaintext code only so the caller can
 * hand it to the email sender — it is never stored or logged as plaintext.
 */
export async function requestOtp(
  prisma: PrismaClient,
  params: { destination: string; channel: OtpChannel; purpose?: OtpPurpose },
): Promise<{ code: string; retryAfterSeconds: number }> {
  const purpose = params.purpose ?? OtpPurpose.LOGIN;
  const now = new Date();

  const latest = await prisma.otpCode.findFirst({
    where: { destination: params.destination, purpose },
    orderBy: { createdAt: 'desc' },
  });

  if (latest) {
    const elapsedSeconds = (now.getTime() - latest.createdAt.getTime()) / 1000;
    if (elapsedSeconds < env.otpResendCooldownSeconds) {
      throw new OtpError('cooldown', 429, Math.ceil(env.otpResendCooldownSeconds - elapsedSeconds));
    }
  }

  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const recentCount = await prisma.otpCode.count({
    where: { destination: params.destination, purpose, createdAt: { gte: hourAgo } },
  });
  if (recentCount >= HOURLY_REQUEST_LIMIT) {
    throw new OtpError('rate_limited', 429, env.otpResendCooldownSeconds);
  }

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(now.getTime() + env.otpTtlSeconds * 1000);

  await prisma.$transaction([
    prisma.otpCode.updateMany({
      where: { destination: params.destination, purpose, consumedAt: null },
      data: { consumedAt: now },
    }),
    prisma.otpCode.create({
      data: {
        destination: params.destination,
        channel: params.channel,
        purpose,
        codeHash,
        expiresAt,
      },
    }),
  ]);

  return { code, retryAfterSeconds: env.otpResendCooldownSeconds };
}

/**
 * Verifies a submitted code against the latest live code for a destination.
 * Wrong/expired/consumed codes all raise the same generic error (anti-enumeration).
 * Exceeding maxAttempts invalidates the code with a distinct error so the
 * frontend can prompt "request a new code" instead of "wrong code, try again."
 */
export async function verifyOtp(
  prisma: PrismaClient,
  params: { destination: string; code: string; purpose?: OtpPurpose },
): Promise<void> {
  const purpose = params.purpose ?? OtpPurpose.LOGIN;
  const now = new Date();

  const record = await prisma.otpCode.findFirst({
    where: { destination: params.destination, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!record || record.expiresAt < now) {
    throw new OtpError('invalid_or_expired_code', 400);
  }

  if (record.attemptCount >= record.maxAttempts) {
    await prisma.otpCode.update({ where: { id: record.id }, data: { consumedAt: now } });
    throw new OtpError('too_many_attempts', 400);
  }

  const matches = await bcrypt.compare(params.code, record.codeHash);
  if (!matches) {
    const attemptCount = record.attemptCount + 1;
    await prisma.otpCode.update({
      where: { id: record.id },
      data: {
        attemptCount,
        ...(attemptCount >= record.maxAttempts ? { consumedAt: now } : {}),
      },
    });
    throw new OtpError('invalid_or_expired_code', 400);
  }

  await prisma.otpCode.update({ where: { id: record.id }, data: { consumedAt: now } });
}
