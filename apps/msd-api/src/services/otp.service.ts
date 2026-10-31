import * as crypto from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { ApiError } from '../lib/http';
import type { OtpPurpose } from '../schemas/auth.schema';
import { missingOtpConfiguration, sendOtp as sendSmsOtp } from '../providers/sms/connectExpress.provider';
import { sendOtpEmail } from '../providers/email/smtp.provider';
import { suspendedMessage } from '../lib/member-messages';
import { readMemberAccessState } from './member-access.service';
import { normalizeIdentifier } from '../lib/normalizeIdentifier';

const OTP_HASH_ROUNDS = 10;
const CUSTOMER_DUMMY_OTP = '111111';

/** `identifier` doubles as email or phone across this flow — an `@` is the only reliable signal. */
function isPhoneIdentifier(identifier: string): boolean {
  return !identifier.includes('@');
}

type DummyLoginAccount = {
  id: string;
  status: string;
  deletedAt: Date | null;
  roles: { role: { key: string } }[];
};

const DUMMY_ROLE_OTP: Record<string, { envName: string; getValue: () => string }> = {
  admin: { envName: 'ADMIN_LOGIN_OTP', getValue: () => env.adminLoginOtp },
  member: { envName: 'MEMBER_LOGIN_OTP', getValue: () => env.memberLoginOtp },
  vendor: { envName: 'MEMBER_LOGIN_OTP', getValue: () => env.memberLoginOtp },
  sales: { envName: 'SALES_LOGIN_OTP', getValue: () => env.salesLoginOtp },
  marketing: { envName: 'MARKETING_LOGIN_OTP', getValue: () => env.marketingLoginOtp },
  support: { envName: 'SUPPORT_LOGIN_OTP', getValue: () => env.supportLoginOtp },
  customer: { envName: 'fixed customer OTP', getValue: () => CUSTOMER_DUMMY_OTP },
};
const STAFF_LOGIN_ROLES = new Set(['super_admin', 'admin', 'member', 'vendor', 'sales', 'marketing', 'support']);

function requireOtpValue(name: string, value: string): string {
  if (!value) throw new ApiError('SERVER_ERROR', `Missing required environment variable: ${name}`);
  if (!/^\d{6}$/.test(value)) throw new ApiError('SERVER_ERROR', `${name} must contain exactly 6 digits`);
  return value;
}

async function findPhoneAccount(identifier: string): Promise<DummyLoginAccount | null> {
  return (await prisma.user.findFirst({
    where: { phone: identifier, deletedAt: null },
    select: {
      id: true,
      status: true,
      deletedAt: true,
      roles: { select: { role: { select: { key: true } } } },
    },
  })) as DummyLoginAccount | null;
}

/** Staff and Super Admin accounts must use their registered mobile, never an email OTP bypass. */
async function emailOtpAllowed(identifier: string): Promise<boolean> {
  const account = await prisma.user.findFirst({
    where: { email: identifier, deletedAt: null },
    select: { roles: { select: { role: { select: { key: true } } } } },
  });
  return !(account?.roles ?? []).some(({ role }: { role: { key: string } }) => STAFF_LOGIN_ROLES.has(role.key));
}

/** Super Admin always uses its own environment credential, even when other roles use SMS mode. */
async function getSuperAdminLoginOtp(
  identifier: string,
  account: DummyLoginAccount | null,
): Promise<{ handled: boolean; otp: string | null }> {
  const configured = env.superAdminLoginMobile ? normalizeIdentifier(env.superAdminLoginMobile) : '';
  const isConfiguredNumber = Boolean(configured && configured === identifier);
  if (!account || account.deletedAt) return { handled: isConfiguredNumber, otp: null };

  const roles = account.roles ?? [];
  const superAdmin = roles.some(({ role }) => role.key === 'super_admin');
  if (!superAdmin && !isConfiguredNumber) return { handled: false, otp: null };
  if (superAdmin && !env.superAdminLoginMobile) {
    throw new ApiError('SERVER_ERROR', 'Missing required environment variable: SUPERADMIN_LOGIN_MOBILE');
  }
  if (env.superAdminLoginMobile && !/^\+91\d{10}$/.test(configured)) {
    throw new ApiError('SERVER_ERROR', 'SUPERADMIN_LOGIN_MOBILE must be a valid Indian mobile number');
  }
  if (!superAdmin || !isConfiguredNumber) {
    throw new ApiError('UNAUTHORIZED', 'Invalid login credentials');
  }
  if (account.status !== 'active') {
    throw new ApiError('FORBIDDEN', 'This account has been disabled. Please contact support.');
  }
  const access = await readMemberAccessState(account.id);
  if (access.kind === 'blocked') throw new ApiError('MEMBER_SUSPENDED', suspendedMessage(access.reason));
  return { handled: true, otp: requireOtpValue('SUPERADMIN_LOGIN_OTP', env.superAdminLoginOtp) };
}

/** Dummy login never stores a fixed OTP in OtpChallenge or sends it to a provider. */
async function getDummyLoginOtps(account: DummyLoginAccount | null): Promise<string[] | null> {
  if (!account || account.deletedAt) return null;
  if (account.status !== 'active') {
    throw new ApiError('FORBIDDEN', 'This account has been disabled. Please contact support.');
  }
  const roles = (account.roles ?? []).map(({ role }) => role.key);
  const eligibleRoles = roles.filter((role) => Object.hasOwn(DUMMY_ROLE_OTP, role));
  if (eligibleRoles.length === 0) return null;
  const credentials = eligibleRoles.map((role) => DUMMY_ROLE_OTP[role]);
  const configured = credentials.filter(({ getValue }) => Boolean(getValue()));
  if (configured.length === 0) {
    throw new ApiError('SERVER_ERROR', `Missing required environment variable: ${credentials[0].envName}`);
  }
  const access = await readMemberAccessState(account.id);
  if (access.kind === 'blocked') throw new ApiError('MEMBER_SUSPENDED', suspendedMessage(access.reason));
  return configured.map(({ envName, getValue }) => requireOtpValue(envName, getValue()));
}

function otpMatches(submitted: string, expected: string): boolean {
  return /^\d{6}$/.test(submitted) && crypto.timingSafeEqual(Buffer.from(submitted), Buffer.from(expected));
}

/**
 * A suspended or archived member gets no OTP: no challenge row, no SMS, no email. This tells
 * anyone who knows the identifier that it belongs to a suspended member, which the spec accepts;
 * `otpRequestRateLimiter` limits probing.
 */
async function assertMemberMayRequestOtp(identifier: string): Promise<void> {
  const owner = await prisma.user.findFirst({
    where: isPhoneIdentifier(identifier) ? { phone: identifier, deletedAt: null } : { email: identifier, deletedAt: null },
    select: { id: true },
  });
  if (!owner) return;
  const access = await readMemberAccessState(owner.id);
  if (access.kind === 'blocked') {
    throw new ApiError('MEMBER_SUSPENDED', suspendedMessage(access.reason));
  }
}

export async function requestOtp(identifier: string, purpose: OtpPurpose): Promise<void> {
  if (env.otpProvider === 'dummy' && isPhoneIdentifier(identifier) && purpose !== 'login') {
    throw new ApiError('SERVICE_UNAVAILABLE', 'Phone OTP is unavailable while OTP_PROVIDER=dummy');
  }

  if (isPhoneIdentifier(identifier) && purpose === 'login') {
    const account = await findPhoneAccount(identifier);
    const superAdmin = await getSuperAdminLoginOtp(identifier, account);
    if (superAdmin.handled) return;

    if (env.otpProvider === 'dummy') {
      await getDummyLoginOtps(account);
      return;
    }
  }

  if (!isPhoneIdentifier(identifier) && !(await emailOtpAllowed(identifier))) return;

  if (isPhoneIdentifier(identifier) && env.otpProvider === 'sms') {
    const missing = missingOtpConfiguration();
    if (missing.length > 0) {
      throw new ApiError('SERVER_ERROR', `Missing required SMS environment variable(s): ${missing.join(', ')}`);
    }
  }

  await assertMemberMayRequestOtp(identifier);

  const otp = crypto.randomInt(100000, 999999).toString();

  const hashedOtp = await bcrypt.hash(otp, OTP_HASH_ROUNDS);
  const expiresAt = new Date(Date.now() + env.otpExpiryMinutes * 60 * 1000);

  await prisma.otpChallenge.create({
    data: { identifier, purpose, hashedOtp, expiresAt },
  });

  if (isPhoneIdentifier(identifier)) {
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
  if (isPhoneIdentifier(identifier)) {
    const account = await findPhoneAccount(identifier);
    const superAdmin = await getSuperAdminLoginOtp(identifier, account);
    if (superAdmin.handled) {
      if (!superAdmin.otp || !otpMatches(otp, superAdmin.otp)) {
        throw new ApiError('UNAUTHORIZED', 'Incorrect OTP');
      }
      return;
    }
    if (env.otpProvider === 'dummy') {
      const expected = await getDummyLoginOtps(account);
      if (!expected || !expected.some((candidate) => otpMatches(otp, candidate))) {
        throw new ApiError('UNAUTHORIZED', 'Incorrect OTP');
      }
      return;
    }
  }

  if (!isPhoneIdentifier(identifier) && !(await emailOtpAllowed(identifier))) {
    throw new ApiError('UNAUTHORIZED', 'Incorrect OTP');
  }

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
