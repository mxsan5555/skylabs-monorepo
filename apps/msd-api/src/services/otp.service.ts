import * as crypto from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { ApiError } from '../lib/http';
import type { OtpPurpose } from '../schemas/auth.schema';
import { sendOtp as sendSmsOtp } from '../providers/sms/connectExpress.provider';
import { sendOtpEmail } from '../providers/email/smtp.provider';

const OTP_HASH_ROUNDS = 10;

/** `identifier` doubles as email or phone across this flow — an `@` is the only reliable signal. */
function isPhoneIdentifier(identifier: string): boolean {
  return !identifier.includes('@');
}

export async function requestOtp(identifier: string, purpose: OtpPurpose): Promise<void> {
  const otp = crypto.randomInt(100000, 999999).toString();
  
  const hashedOtp = await bcrypt.hash(otp, OTP_HASH_ROUNDS);
  const expiresAt = new Date(Date.now() + env.otpExpiryMinutes * 60 * 1000);

  await prisma.otpChallenge.create({
    data: { identifier, purpose, hashedOtp, expiresAt },
  });

  if (isPhoneIdentifier(identifier)) {
    console.log("Sending OTP:", otp, "to:", identifier);
    const delivered = await sendSmsOtp(identifier, otp);
    if (!delivered) {
      throw new ApiError('SERVER_ERROR', 'Failed to send OTP via SMS provider');
    }
    return;
  }

  const delivered = await sendOtpEmail(identifier, otp);
  if (!delivered) {
    throw new ApiError('SERVER_ERROR', 'Failed to send OTP via email provider');
  }
}

/**
 * Verifies the most recent unconsumed, unexpired OtpChallenge for (identifier, purpose is
 * ignored here — verify matches on identifier only per the spec's request shape) and marks
 * it consumed. Throws ApiError with a code the route maps to the documented 401s.
 */
export async function verifyOtp(identifier: string, otp: string): Promise<void> {
  const challenge = await prisma.otpChallenge.findFirst({
    where: { identifier, verifiedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!challenge) {
    throw new ApiError('UNAUTHORIZED', 'No pending OTP for this identifier');
  }

  if (challenge.expiresAt.getTime() < Date.now()) {
    throw new ApiError('UNAUTHORIZED', 'OTP has expired');
  }

  if (challenge.attempts >= env.otpMaxAttempts) {
    throw new ApiError('RATE_LIMITED', 'Too many incorrect attempts, request a new OTP');
  }

  const isMatch = await bcrypt.compare(otp, challenge.hashedOtp);
  if (!isMatch) {
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    throw new ApiError('UNAUTHORIZED', 'Incorrect OTP');
  }

  await prisma.otpChallenge.update({
    where: { id: challenge.id },
    data: { verifiedAt: new Date() },
  });
}
