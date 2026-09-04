import { prisma } from '../lib/prisma';

export interface WriteAuditLogInput {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
}

export async function writeAuditLog(input: WriteAuditLogInput) {
  return prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      before: input.before as never,
      after: input.after as never,
      ip: input.ip,
      userAgent: input.userAgent,
    },
  });
}

export interface ListAuditLogsOptions {
  targetUserId?: string;
  page?: number;
  pageSize?: number;
}

export async function listAuditLogs(options: ListAuditLogsOptions = {}) {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 25;

  // targetUserId filters audit rows where the target of the action was that user
  // (targetType='User', targetId=userId) — the common case for the admin console.
  const where = options.targetUserId ? { targetType: 'User', targetId: options.targetUserId } : {};

  const [rows, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { rows, total, page, pageSize };
}
