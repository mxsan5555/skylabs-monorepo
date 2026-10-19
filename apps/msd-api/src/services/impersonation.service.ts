import * as crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { signPreviewToken } from '../lib/jwt';
import { writeAuditLog } from './audit.service';

interface Meta {
  ip?: string;
  userAgent?: string;
}

/**
 * Issues a short-lived "Login As" preview token for targetUserId. Authorization for who
 * may call this lives entirely in the route's `requirePermission` gate (never a hardcoded
 * role check here) — this function just does the work once the caller has already been
 * cleared to perform it.
 */
export async function startImpersonation(callerId: string, targetUserId: string, meta: Meta = {}) {
  if (callerId === targetUserId) {
    throw new ApiError('VALIDATION_ERROR', 'Cannot impersonate yourself');
  }

  const target = await prisma.user.findFirst({
    where: { id: targetUserId, deletedAt: null },
    include: { roles: { include: { role: true } } },
  });
  if (!target) throw new ApiError('NOT_FOUND', 'Target user not found');

  const targetRoleKeys = target.roles.map((ur) => ur.role.key);
  const jti = crypto.randomUUID();

  const previewToken = signPreviewToken(
    { sub: target.id, roles: targetRoleKeys, app: 'msd', isPreview: true, impersonatedBy: callerId },
    jti,
  );

  await prisma.impersonationSession.create({
    data: {
      superAdminUserId: callerId,
      targetUserId: target.id,
      previewTokenJti: jti,
    },
  });

  await writeAuditLog({
    actorUserId: callerId,
    action: 'impersonate.start',
    targetType: 'User',
    targetId: target.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return { previewToken };
}
