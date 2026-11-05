import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { generateOtp } from '../lib/crypto';
import { HttpError } from '../middleware/errorHandler';
import type { OtpPurpose } from '../generated/prisma-client';
import { sendOtp as sendSmsOtp } from '../providers/sms/connectExpress.provider';
import { sendOtpEmail } from '../providers/email/smtp.provider';
import { otpDeliveryError } from '../providers/otp-delivery-error';

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
  if(identifier.startsWith('dl-consent:'))throw new HttpError(422,'OTP_PURPOSE_RESTRICTED','This retired challenge cannot be used to sign in');
  const otp = generateOtp();
  const hashedOtp = await bcrypt.hash(otp, BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000);

  const challenge = await prisma.otpChallenge.create({
    data: { identifier, purpose, hashedOtp, expiresAt },
  });

  const channel = isPhoneIdentifier(identifier) ? 'SMS' : 'Email';
  // Explicit opt-in, never production, and off by default (including in tests, which never
  // set this var) — logs the OTP to the server's own console instead of attempting real
  // SMS/SMTP delivery, so a developer can sign in as a demo/test account without live
  // provider credentials. Verification still goes through the normal hashed, expiring,
  // attempt-limited OtpChallenge row below — nothing about the OTP itself is weakened.
  if (process.env.NODE_ENV !== 'production' && process.env.OTP_DEV_LOG === 'true') {
    console.log(`[otp:dev] ${channel} OTP for ${identifier} (${purpose}): ${otp}`);
    return;
  }
  try {
    const delivered = channel === 'SMS' ? await sendSmsOtp(identifier, otp) : await sendOtpEmail(identifier, otp);
    if (!delivered) throw otpDeliveryError(channel, 'rejected');
  } catch (error) {
    // Retain the challenge record, but never leave an undelivered code usable.
    await prisma.otpChallenge.update({where:{id:challenge.id},data:{expiresAt:new Date()}});
    if (error instanceof HttpError) throw error;
    throw otpDeliveryError(channel, 'unavailable');
  }
}

/** Verifies the most recent unexpired, unverified OTP challenge for `identifier`+`purpose`. */
export async function verifyOtp(identifier: string, purpose: OtpPurpose, otp: string): Promise<void> {
  if(identifier.startsWith('dl-consent:'))throw new HttpError(422,'OTP_PURPOSE_RESTRICTED','This retired challenge cannot be used to sign in');
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
