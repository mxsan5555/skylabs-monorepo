import { prisma } from '../lib/prisma';
import type { LoginMethod } from '../generated/prisma-client';

/** Role key auto-granted to a brand-new mera-driver user (see CLAUDE.md role table). */
const DEFAULT_ROLE_KEY = 'customer';

function isEmail(identifier: string): boolean {
  return identifier.includes('@');
}

export function loginMethodForIdentifier(identifier: string): LoginMethod {
  return isEmail(identifier) ? 'otp_email' : 'otp_phone';
}

async function ensureDefaultRole(userId: string): Promise<void> {
  const role = await prisma.role.findUnique({ where: { key: DEFAULT_ROLE_KEY } });
  if (!role) return; // seed not run yet — don't block auth in a fresh/unseeded DB
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    create: { userId, roleId: role.id },
    update: {},
  });
}

/** Finds or creates a User for an OTP identifier (email or phone), granting the default role on first login. */
export async function upsertUserByIdentifier(identifier: string) {
  const field = isEmail(identifier) ? 'email' : 'phone';

  const existing = await prisma.user.findFirst({ where: { [field]: identifier, deletedAt: null } });
  if (existing) return existing;

  const user = await prisma.user.create({
    data: {
      [field]: identifier,
      name: identifier,
    },
  });
  await ensureDefaultRole(user.id);
  return user;
}

export interface GoogleProfileInput {
  googleId: string;
  email: string;
  name: string;
}

/** Finds or creates a User for a verified Google profile, granting the default role on first login. */
export async function upsertUserFromGoogle(profile: GoogleProfileInput) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ googleId: profile.googleId }, { email: profile.email }], deletedAt: null },
  });

  if (existing) {
    if (!existing.googleId) {
      return prisma.user.update({ where: { id: existing.id }, data: { googleId: profile.googleId } });
    }
    return existing;
  }

  const user = await prisma.user.create({
    data: { googleId: profile.googleId, email: profile.email, name: profile.name },
  });
  await ensureDefaultRole(user.id);
  return user;
}

export async function getRoleKeysForUser(userId: string): Promise<string[]> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    select: { role: { select: { key: true } } },
  });
  return userRoles.map((ur) => ur.role.key);
}

export async function recordLoginHistory(
  userId: string,
  method: LoginMethod,
  success: boolean,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<void> {
  await prisma.loginHistory.create({
    data: { userId, method, success, ip: meta.ip, userAgent: meta.userAgent },
  });
}

export async function touchLastLogin(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
}
