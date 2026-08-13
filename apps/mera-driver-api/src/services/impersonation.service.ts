import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { signAccessToken } from '../lib/jwt';
import { HttpError } from '../middleware/errorHandler';
import { writeAuditLog } from './audit.service';

const PREVIEW_TTL_MINUTES = 15;

export interface ImpersonateInput {
  callerId: string;
  targetUserId: string;
  ip?: string;
  userAgent?: string;
}

/**
 * "Login As" a target user. The ONLY authorization check here is the boolean
 * `Role.isSuperAdmin` flag on one of the caller's roles — never a string comparison against
 * a role key/name. The route itself is still gated by the generic `requirePermission`
 * middleware; this is an additional, narrower safety check specific to this one
 * highly-privileged action.
 */
export async function impersonateUser(input: ImpersonateInput): Promise<{ previewToken: string }> {
  const callerRoles = await prisma.userRole.findMany({
    where: { userId: input.callerId },
    include: { role: true },
  });
  const callerIsSuperAdmin = callerRoles.some((ur) => ur.role.isSuperAdmin && ur.role.isActive);

  if (!callerIsSuperAdmin) {
    throw new HttpError(403, 'FORBIDDEN', 'Only a SuperAdmin-flagged role may start an impersonation session');
  }

  const target = await prisma.user.findFirst({ where: { id: input.targetUserId, deletedAt: null } });
  if (!target) {
    throw new HttpError(404, 'NOT_FOUND', 'Target user not found');
  }

  const targetRoles = await prisma.userRole.findMany({ where: { userId: target.id }, include: { role: true } });
  const targetRoleKeys = targetRoles.map((ur) => ur.role.key);

  const jti = crypto.randomUUID();
  const previewToken = signAccessToken(
    {
      sub: target.id,
      roles: targetRoleKeys,
      app: 'mera-driver',
      isPreview: true,
      impersonatedBy: input.callerId,
      jti,
    },
    PREVIEW_TTL_MINUTES,
  );

  await prisma.impersonationSession.create({
    data: {
      superAdminUserId: input.callerId,
      targetUserId: target.id,
      previewTokenJti: jti,
    },
  });

  await writeAuditLog({
    actorUserId: input.callerId,
    action: 'impersonate.start',
    targetType: 'User',
    targetId: target.id,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return { previewToken };
}
