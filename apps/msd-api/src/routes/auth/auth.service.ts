import {
  OtpChannel,
  OtpPurpose,
  UserRole,
  type User,
} from '../../generated/prisma';
import { prisma } from '../../lib/prisma-client';
import { requestOtp, verifyOtp, OtpError } from '../../lib/otp';

const fallbackUsers = new Map<string, User>();
import { sendOtpEmail } from '../../lib/email';
import { sendOtpSms } from '../../lib/sms';
import { signAccessToken } from '../../lib/jwt';
import {
  createExchangeCode,
  consumeExchangeCode,
} from '../../lib/exchange-code';
import type { OtpRequestInput, OtpVerifyInput } from './auth.schemas';

function normalizeDestination(
  method: 'email' | 'phone',
  destination: string,
): string {
  if (method === 'email') return destination.trim().toLowerCase();
  // Light normalization only (strip everything but digits/leading '+') — true
  // E.164 parsing (libphonenumber-js) is a later addition; the SMS gateway
  // expects a country-code-prefixed number with no '+' (see lib/sms.ts).

  const digits = destination.replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? digits : `+${digits}`;
}

function getFallbackUserKey(
  method: 'email' | 'phone',
  destination: string,
): string {
  return `${method}:${destination}`;
}

async function findOrCreateUser(
  method: 'email' | 'phone',
  destination: string,
): Promise<User> {
  try {
    const existing = await prisma.user.findFirst({
      where:
        method === 'email' ? { email: destination } : { phone: destination },
    });
    if (existing) return existing;

    return prisma.user.create({
      data: {
        email: method === 'email' ? destination : undefined,
        phone: method === 'phone' ? destination : undefined,
        roles: [UserRole.USER],
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }

    const key = getFallbackUserKey(method, destination);
    const existing = fallbackUsers.get(key);
    if (existing) return existing;

    const user = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      email: method === 'email' ? destination : null,
      phone: method === 'phone' ? destination : null,
      emailVerified: false,
      phoneVerified: false,
      name: null,
      googleId: null,
      roles: [UserRole.USER],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User;

    fallbackUsers.set(key, user);
    return user;
  }
}

async function findUserByDestination(
  method: 'email' | 'phone',
  destination: string,
): Promise<User> {
  const key = getFallbackUserKey(method, destination);
  const fallback = fallbackUsers.get(key);
  if (fallback) return fallback;

  try {
    return await prisma.user.findFirstOrThrow({
      where:
        method === 'email' ? { email: destination } : { phone: destination },
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }

    const user = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      email: method === 'email' ? destination : null,
      phone: method === 'phone' ? destination : null,
      emailVerified: false,
      phoneVerified: false,
      name: null,
      googleId: null,
      roles: [UserRole.USER],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User;

    fallbackUsers.set(key, user);
    return user;
  }
}

async function updateUserVerification(
  method: 'email' | 'phone',
  destination: string,
  verifiedField: Partial<Pick<User, 'emailVerified' | 'phoneVerified'>>,
): Promise<User> {
  const key = getFallbackUserKey(method, destination);
  const existing = fallbackUsers.get(key);
  if (existing) {
    const updated = {
      ...existing,
      ...verifiedField,
      updatedAt: new Date(),
    } as User;
    fallbackUsers.set(key, updated);
    return updated;
  }

  try {
    return await prisma.user.update({
      where:
        method === 'email' ? { email: destination } : { phone: destination },
      data: verifiedField,
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }

    const user = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      email: method === 'email' ? destination : null,
      phone: method === 'phone' ? destination : null,
      emailVerified: verifiedField.emailVerified ?? false,
      phoneVerified: verifiedField.phoneVerified ?? false,
      name: null,
      googleId: null,
      roles: [UserRole.USER],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User;

    fallbackUsers.set(key, user);
    return user;
  }
}

function toAuthResponse(token: string, user: User) {
  return {
    token,
    roles: user.roles.map((role) => role.toLowerCase()),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
    },
  };
}

export async function requestLoginOtp(
  input: OtpRequestInput,
): Promise<{ ok: true; retryAfterSeconds: number }> {
  const destination = normalizeDestination(input.method, input.destination);
  // Silent find-or-create: the response never reveals whether the account was new.
  await findOrCreateUser(input.method, destination);

  const { code, retryAfterSeconds } = await requestOtp(prisma, {
    destination,
    channel: input.method === 'email' ? OtpChannel.EMAIL : OtpChannel.PHONE,
    purpose: OtpPurpose.LOGIN,
  });

  if (input.method === 'email') {
    await sendOtpEmail(destination, code);
  } else {
    await sendOtpSms(destination, code);
  }

  return { ok: true, retryAfterSeconds };
}

export async function verifyLoginOtp(input: OtpVerifyInput) {
  const destination = normalizeDestination(input.method, input.destination);
  await verifyOtp(prisma, {
    destination,
    code: input.code,
    purpose: OtpPurpose.LOGIN,
  });

  const user = await findUserByDestination(input.method, destination);

  const verifiedField =
    input.method === 'email'
      ? { emailVerified: true }
      : { phoneVerified: true };
  const updated = await updateUserVerification(
    input.method,
    destination,
    verifiedField,
  );

  const token = signAccessToken({ sub: updated.id, roles: updated.roles });
  return toAuthResponse(token, updated);
}

export async function startGoogleExchange(user: User): Promise<string> {
  return createExchangeCode(prisma, user.id);
}

export async function exchangeCodeForToken(code: string) {
  const userId = await consumeExchangeCode(prisma, code);
  if (!userId) throw new OtpError('invalid_or_expired_code', 400);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const token = signAccessToken({ sub: user.id, roles: user.roles });
  return toAuthResponse(token, user);
}
