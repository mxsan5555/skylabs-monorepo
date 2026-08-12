import { prisma } from '../lib/prisma';

interface AuditLogInput {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      before: input.before === undefined ? undefined : (input.before as object),
      after: input.after === undefined ? undefined : (input.after as object),
      ip: input.ip,
      userAgent: input.userAgent,
    },
  });
}
