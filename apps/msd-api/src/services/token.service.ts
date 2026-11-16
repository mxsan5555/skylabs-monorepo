import * as crypto from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { ApiError } from '../lib/http';
import type { Prisma } from '../generated/prisma-client';

const REFRESH_TOKEN_BYTES = 48;
const REFRESH_HASH_ROUNDS = 10;

function generateOpaqueToken(): string {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

function computeLookupHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

interface SessionMeta {
  deviceInfo?: string;
  ip?: string;
  userAgent?: string;
}

/** Issues a brand-new refresh session (login, OAuth, or the first token of a chain). */
export async function issueRefreshSession(userId: string, meta: SessionMeta = {}): Promise<string> {
  const token = generateOpaqueToken();
  const hashedToken = await bcrypt.hash(token, REFRESH_HASH_ROUNDS);
  const lookupHash = computeLookupHash(token);
  const expiresAt = new Date(Date.now() + env.jwtRefreshTtlDays * 24 * 60 * 60 * 1000);

  await prisma.refreshSession.create({
    data: { userId, hashedToken, lookupHash, expiresAt, ...meta },
  });

  return token;
}

async function findSessionByToken(
  token: string,
  where: Prisma.RefreshSessionWhereInput,
): Promise<Prisma.RefreshSessionGetPayload<object> | null> {
  const lookupHash = computeLookupHash(token);
  const indexedMatch = await prisma.refreshSession.findFirst({ where: { ...where, lookupHash } });
  if (indexedMatch) return indexedMatch;

  const legacySessions = await prisma.refreshSession.findMany({ where: { ...where, lookupHash: null } });
  for (const session of legacySessions) {
    if (await bcrypt.compare(token, session.hashedToken)) return session;
  }
  return null;
}

/**
 * Rotates a refresh token: finds the session whose hash matches, verifies it isn't expired
 * or revoked, revokes it, and issues a brand-new one for the same user. If a token is
 * presented that matches an already-revoked session (replay), the entire session chain for
 * that user is revoked as a precaution.
 */
export async function rotateRefreshToken(
  presentedToken: string,
  meta: SessionMeta = {},
): Promise<{ userId: string; roles: string[]; token: string }> {
  const matched = await findSessionByToken(presentedToken, { expiresAt: { gt: new Date() } });

  if (!matched) {
    throw new ApiError('UNAUTHORIZED', 'Invalid or expired refresh token');
  }

  if (matched.revokedAt) {
    // Replay of an already-used/rotated token — revoke every active session for this user.
    await prisma.refreshSession.updateMany({
      where: { userId: matched.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new ApiError('UNAUTHORIZED', 'Refresh token replay detected; all sessions revoked');
  }

  await prisma.refreshSession.update({
    where: { id: matched.id },
    data: { revokedAt: new Date() },
  });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: matched.userId },
    include: { roles: { include: { role: true } } },
  });

  const newToken = await issueRefreshSession(user.id, meta);

  return {
    userId: user.id,
    roles: user.roles.map((ur) => ur.role.key),
    token: newToken,
  };
}

export async function revokeRefreshToken(presentedToken: string): Promise<void> {
  const matched = await findSessionByToken(presentedToken, { revokedAt: null });
  if (!matched) return;
  await prisma.refreshSession.update({
    where: { id: matched.id },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
