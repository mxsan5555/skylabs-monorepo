import { prisma } from '../lib/prisma';
import type { AuditAction } from '../lib/audit';

export interface AuditLogInput {
  actorUserId: string;
  action: AuditAction;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
}

/**
 * Row data for one AuditLog insert. Use it with `tx.auditLog.create({ data })` when the audit
 * row must commit or roll back together with the change it records.
 */
export function auditLogData(input: AuditLogInput) {
  return {
    actorUserId: input.actorUserId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    before: input.before === undefined ? undefined : (input.before as object),
    after: input.after === undefined ? undefined : (input.after as object),
    ip: input.ip,
    userAgent: input.userAgent,
  };
}

/**
 * Best-effort by design: audit logging is observability, not business-critical data. Callers do
 * `await mutate(); await writeAuditLog(...); sendData(...)` inside one try/catch — if the insert
 * below threw, a transient DB blip on the audit table would falsely 500 an operation that already
 * committed successfully. So this never rejects; a failure is logged with enough context to
 * reconstruct what should have been written, and the promise simply resolves. Callers keep
 * `await`ing it exactly as before.
 */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({ data: auditLogData(input) });
  } catch (err) {
    console.error({
      err,
      context: 'writeAuditLog failed — operation already committed, audit entry lost',
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
    });
  }
}
