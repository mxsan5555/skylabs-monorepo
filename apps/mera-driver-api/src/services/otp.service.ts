import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { generateOtp } from '../lib/crypto';
import { HttpError } from '../middleware/errorHandler';
import type { OtpPurpose } from '../generated/prisma-client';
import { sendOtp as sendSmsOtp } from '../providers/sms/connectExpress.provider';
import { sendOtpEmail } from '../providers/email/smtp.provider';

const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES ?? 10);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS ?? 5);
const BCRYPT_ROUNDS = 10;

/** `identifier` doubles as email or phone across this flow — an `@` is the only reliable signal. */
function isPhoneIdentifier(identifier: string): boolean {
  return !identifier.includes('@');
}

/**
 * Generates and stores a hashed OTP challenge. Always returns the same shape whether or
 * not `identifier` belongs to a real user — callers must not be able to enumerate accounts
 * from this endpoint's response.
 */
export async function requestOtp(identifier: string, purpose: OtpPurpose): Promise<void> {
  const otp = generateOtp();
  const hashedOtp = await bcrypt.hash(otp, BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000);

  await prisma.otpChallenge.create({
    data: { identifier, purpose, hashedOtp, expiresAt },
  });

  const delivered = isPhoneIdentifier(identifier)
    ? await sendSmsOtp(identifier, otp)
    : await sendOtpEmail(identifier, otp);

  if (!delivered) {
    throw new HttpError(500, 'SERVER_ERROR', 'Failed to send OTP');
  }
}

/** Verifies the most recent unexpired, unverified OTP challenge for `identifier`+`purpose`. */
export async function verifyOtp(identifier: string, purpose: OtpPurpose, otp: string): Promise<void> {
  const challenge = await prisma.otpChallenge.findFirst({
    where: { identifier, purpose, verifiedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  if (!challenge) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'OTP is invalid or has expired');
  }

  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Too many attempts — request a new OTP');
  }

  const isMatch = await bcrypt.compare(otp, challenge.hashedOtp);

  if (!isMatch) {
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    throw new HttpError(422, 'VALIDATION_ERROR', 'OTP is invalid or has expired');
  }

  await prisma.otpChallenge.update({
    where: { id: challenge.id },
    data: { verifiedAt: new Date() },
  });
}
