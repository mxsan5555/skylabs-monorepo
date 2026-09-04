import { prisma } from '../lib/prisma';
import { generateOpaqueToken, sha256Hex } from '../lib/crypto';
import { signAccessToken } from '../lib/jwt';
import { HttpError } from '../middleware/errorHandler';

const REFRESH_TTL_DAYS = Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30);

export interface RequestMeta {
  deviceInfo?: string;
  ip?: string;
  userAgent?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Issues a fresh access+refresh pair and persists the refresh session (hashed). */
export async function issueTokenPair(userId: string, roles: string[], meta: RequestMeta = {}): Promise<TokenPair> {
  const accessToken = signAccessToken({ sub: userId, roles, app: 'mera-driver' });
  const refreshToken = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60_000);

  await prisma.refreshSession.create({
    data: {
      userId,
      hashedToken: sha256Hex(refreshToken),
      deviceInfo: meta.deviceInfo,
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt,
    },
  });

  return { accessToken, refreshToken };
}

/**
 * Rotates a refresh token: the presented token must match a live (unrevoked, unexpired)
 * RefreshSession. If it matches a session that was already rotated away (revoked with a
 * `replacedBy` pointer), that is a replay of a stolen/reused token — the entire session
 * chain for that user is revoked so the legitimate rotated session dies too.
 */
export async function rotateRefreshToken(presentedToken: string, meta: RequestMeta = {}): Promise<TokenPair> {
  const hashedToken = sha256Hex(presentedToken);
  const session = await prisma.refreshSession.findUnique({ where: { hashedToken } });

  if (!session) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Invalid refresh token');
  }

  if (session.revokedAt) {
    if (session.replacedBy) {
      // Replay of an already-rotated token — assume compromise, kill the whole chain.
      await prisma.refreshSession.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    throw new HttpError(401, 'UNAUTHORIZED', 'Refresh token has been revoked');
  }

  if (session.expiresAt < new Date()) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Refresh token has expired');
  }

  const userRoles = await prisma.userRole.findMany({
    where: { userId: session.userId },
    select: { role: { select: { key: true } } },
  });
  const roleKeys = userRoles.map((ur) => ur.role.key);

  const accessToken = signAccessToken({ sub: session.userId, roles: roleKeys, app: 'mera-driver' });
  const refreshToken = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60_000);

  const newSession = await prisma.refreshSession.create({
    data: {
      userId: session.userId,
      hashedToken: sha256Hex(refreshToken),
      deviceInfo: meta.deviceInfo,
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt,
    },
  });

  await prisma.refreshSession.update({
    where: { id: session.id },
    data: { revokedAt: new Date(), replacedBy: newSession.id },
  });

  return { accessToken, refreshToken };
}

/** Revokes a single refresh session (logout on one device). Idempotent. */
export async function revokeRefreshToken(presentedToken: string): Promise<void> {
  const hashedToken = sha256Hex(presentedToken);
  await prisma.refreshSession.updateMany({
    where: { hashedToken, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Revokes every active refresh session for a user (logout-all / forced sign-out). */
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await prisma.refreshSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
