import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { signAccessToken } from '../lib/jwt';
import { issueRefreshSession } from './token.service';
import type { LoginMethod } from '../generated/prisma-client';

/** Shared by both login paths below — a brand-new User always defaults to `active` (this
 *  function is a no-op for them), so this only ever actually blocks a RETURNING user whose
 *  account was disabled since their last login. Never issues a token for a blocked/inactive
 *  account; the calling function's own LoginHistory row is written with `success: false` so a
 *  blocked login attempt is still visible in the account's history, matching the existing
 *  `success: true` write on the happy path. */
async function assertUserMayLogIn(
  user: { id: string; status: string },
  meta: { ip?: string; userAgent?: string },
  method: LoginMethod,
) {
  if (user.status === 'active') return;
  await prisma.loginHistory.create({ data: { userId: user.id, method, success: false, ...meta } });
  throw new ApiError('FORBIDDEN', 'This account has been disabled. Please contact support.');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function identifierKind(identifier: string): 'email' | 'phone' {
  return EMAIL_RE.test(identifier) ? 'email' : 'phone';
}

interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

/** Upserts the User by identifier (email or phone), issues a JWT pair, and records LoginHistory. */
export async function loginWithIdentifier(identifier: string, meta: SessionMeta = {}) {
  const kind = identifierKind(identifier);
  const method: LoginMethod = kind === 'email' ? 'otp_email' : 'otp_phone';

  // Checked via a plain read BEFORE the upsert below — a blocked/inactive RETURNING user must
  // never have `lastLoginAt` touched (misleading for a rejected attempt) or a token issued. A
  // brand-new identifier has no row yet, so this is a no-op for the signup path.
  const existing = await prisma.user.findUnique({ where: kind === 'email' ? { email: identifier } : { phone: identifier } });
  if (existing) await assertUserMayLogIn(existing, meta, method);

  const user = await prisma.user.upsert({
    where: kind === 'email' ? { email: identifier } : { phone: identifier },
    update: { lastLoginAt: new Date() },
    create: {
      name: identifier,
      email: kind === 'email' ? identifier : undefined,
      phone: kind === 'phone' ? identifier : undefined,
      lastLoginAt: new Date(),
    },
    include: { roles: { include: { role: true } } },
  });

  // Default role on first login for this RBAC's role set is 'customer' (see prisma/seed.ts —
  // this task's seed defines super_admin/admin/customer/vendor/marketing/sales, not the
  // 'user' role from CLAUDE.md's older role table; see HANDOFF notes for the deviation).
  if (user.roles.length === 0) {
    const defaultRole = await prisma.role.findUnique({ where: { key: 'customer' } });
    if (defaultRole) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: defaultRole.id } });
    }
  }

  const roles = await prisma.userRole.findMany({
    where: { userId: user.id },
    include: { role: true },
  });
  const roleKeys = roles.map((ur) => ur.role.key);

  const accessToken = signAccessToken({ sub: user.id, roles: roleKeys, app: 'msd' });
  const refreshToken = await issueRefreshSession(user.id, meta);

  await prisma.loginHistory.create({
    data: { userId: user.id, method, success: true, ...meta },
  });

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, roles: roleKeys },
  };
}

/** Upserts a User from a verified Google profile (link by email) and issues a JWT pair. */
export async function loginWithGoogle(
  googleId: string,
  email: string,
  name: string,
  meta: SessionMeta = {},
) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) await assertUserMayLogIn(existing, meta, 'google');

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { googleId, lastLoginAt: new Date(), name: existing.name || name },
      })
    : await prisma.user.create({
        data: { googleId, email, name, lastLoginAt: new Date() },
      });

  const rolesRows = await prisma.userRole.findMany({ where: { userId: user.id }, include: { role: true } });
  if (rolesRows.length === 0) {
    const defaultRole = await prisma.role.findUnique({ where: { key: 'customer' } });
    if (defaultRole) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: defaultRole.id } });
    }
  }
  const roles = await prisma.userRole.findMany({ where: { userId: user.id }, include: { role: true } });
  const roleKeys = roles.map((ur) => ur.role.key);

  const accessToken = signAccessToken({ sub: user.id, roles: roleKeys, app: 'msd' });
  const refreshToken = await issueRefreshSession(user.id, meta);

  await prisma.loginHistory.create({
    data: { userId: user.id, method: 'google', success: true, ...meta },
  });

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, roles: roleKeys },
  };
}
