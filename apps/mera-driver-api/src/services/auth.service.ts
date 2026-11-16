import { prisma } from '../lib/prisma';
import { normalizeIdentifier } from '../lib/normalizeIdentifier';
import { HttpError } from '../middleware/errorHandler';
import type { Prisma, LoginMethod } from '../generated/prisma-client';

/** Role key auto-granted to a brand-new mera-driver user (see CLAUDE.md role table). */
const DEFAULT_ROLE_KEY = 'customer';

function isEmail(identifier: string): boolean {
  return identifier.includes('@');
}

export function loginMethodForIdentifier(identifier: string): LoginMethod {
  const normalized = normalizeIdentifier(identifier);
  return isEmail(normalized) ? 'otp_email' : 'otp_phone';
}

async function ensureDefaultRole(userId: string, client: Prisma.TransactionClient = prisma): Promise<void> {
  const role = await client.role.findUnique({ where: { key: DEFAULT_ROLE_KEY } });
  if (!role || !role.isActive) throw new HttpError(503, 'CUSTOMER_ROLE_NOT_CONFIGURED', 'Customer portal role is unavailable. Contact your administrator.');
  await client.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    create: { userId, roleId: role.id },
    update: {},
  });
}

/** Finds or creates a User for an OTP identifier (email or phone), granting the default role on first login. */
export async function upsertUserByIdentifier(identifier: string) {
  const normalized = normalizeIdentifier(identifier);
  const field = isEmail(normalized) ? 'email' : 'phone';

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email: field === 'email' ? normalized.toLowerCase() : undefined },
        { phone: field === 'phone' ? normalized : undefined },
        { phone: field === 'phone' && normalized.startsWith('+91') ? normalized.slice(3) : undefined },
      ],
      deletedAt: null,
    },
  });
  if (existing) return existing;

  return prisma.$transaction(async tx => {
  const user = await tx.user.create({
    data: {
      [field]: field === 'email' ? normalized.toLowerCase() : normalized,
      name: identifier,
    },
  });
  await ensureDefaultRole(user.id, tx);
  await ensureCustomerProfile(user, tx);
  return user;
  });
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

  return prisma.$transaction(async tx => {
  const user = await tx.user.create({
    data: { googleId: profile.googleId, email: profile.email, name: profile.name },
  });
  await ensureDefaultRole(user.id, tx);
  await ensureCustomerProfile(user, tx);
  return user;
  });
}

export async function getRoleKeysForUser(userId: string): Promise<string[]> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId, role: { isActive: true } },
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

export async function ensureCustomerProfile(user: {id: string; name: string; phone: string | null; email: string | null}, client: Prisma.TransactionClient = prisma) {
  if (await client.customer.findUnique({where: {userId: user.id}})) return;
  const contacts = [...(user.phone ? [{mobileNumber: user.phone}, ...(user.phone.startsWith('+91') ? [{mobileNumber: user.phone.slice(3)}] : [])] : []), ...(user.email ? [{email: {equals: user.email, mode: 'insensitive' as const}}] : [])];
  if (contacts.length && await client.customer.findFirst({where: {OR: contacts}, select: {id: true}})) {
    throw new HttpError(409, 'CUSTOMER_LINK_REQUIRED', 'An existing customer record matches this account. Ask authorized staff to link it; no records have been merged.');
  }
  await client.customer.upsert({where: {userId: user.id}, update: {}, create: {userId: user.id, firstName: user.name, mobileNumber: user.phone, email: user.email, registrationSource: 'Website'}});
}
