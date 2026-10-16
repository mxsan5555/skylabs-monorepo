import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma } from '../generated/prisma-client';
import { auditLogData } from './audit.service';
import { revokeAllRefreshTokens } from './token.service';
import { clearMemberAccessCache } from './member-access.service';
import { sendMemberNotice, type MemberNoticeKind, type MemberNoticeTarget } from './member-notice.service';
import {
  assertTransition,
  REASON_MAX,
  REASON_MIN,
  type MemberStatusValue,
  type SettableMemberStatus,
} from './member-status-machine';

export interface StatusActor {
  userId: string;
  ip?: string;
  userAgent?: string;
}

const MEMBER_SELECT = {
  id: true,
  status: true,
  ownerUserId: true,
  businessName: true,
  owner: { select: { name: true, email: true, phone: true } },
} as const;

function validReason(raw: string | undefined): string {
  const reason = (raw ?? '').trim();
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    throw new ApiError('VALIDATION_ERROR', `Enter a reason of ${REASON_MIN} to ${REASON_MAX} characters.`, {
      fields: { reason: `Use ${REASON_MIN} to ${REASON_MAX} characters.` },
    });
  }
  return reason;
}

async function loadMember(memberId: string) {
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: MEMBER_SELECT });
  if (!member) throw new ApiError('NOT_FOUND', 'Member not found');
  return member;
}

/** Runs after commit. A failed notice never undoes or fails the status change. */
async function notify(kind: MemberNoticeKind, target: MemberNoticeTarget, reason?: string): Promise<void> {
  try {
    await sendMemberNotice(kind, target, reason);
  } catch (err) {
    console.error({ err, context: 'member notice failed after status change', kind });
  }
}

/**
 * Moves a member between ACTIVE, INACTIVE and SUSPENDED. The status update, the history row,
 * the audit row and (on suspend) the owner's refresh session revocation commit in one
 * transaction. Notices go out after commit.
 */
export async function changeMemberStatus(
  memberId: string,
  to: SettableMemberStatus,
  rawReason: string,
  actor: StatusActor,
): Promise<{ from: MemberStatusValue; to: SettableMemberStatus }> {
  const reason = validReason(rawReason);
  const member = await loadMember(memberId);
  const from = member.status as MemberStatusValue;
  assertTransition(from, to);

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: memberId },
      data: {
        status: to,
        statusReason: to === 'ACTIVE' ? null : reason,
        statusChangedAt: now,
        statusChangedByUserId: actor.userId,
        ...(to === 'ACTIVE' ? { reviewFlaggedAt: null } : {}),
      },
    });
    await tx.memberStatusHistory.create({
      data: { memberId, fromStatus: from, toStatus: to, reason, actorUserId: actor.userId },
    });
    if (to === 'SUSPENDED' && member.ownerUserId) {
      await revokeAllRefreshTokens(member.ownerUserId, tx);
    }
    await tx.auditLog.create({
      data: auditLogData({
        actorUserId: actor.userId,
        action: 'member.status.changed',
        targetType: 'Member',
        targetId: memberId,
        before: { status: from },
        after: { status: to, reason },
        ip: actor.ip,
        userAgent: actor.userAgent,
      }),
    });
  });

  if (member.ownerUserId) clearMemberAccessCache(member.ownerUserId);

  const target = { name: member.owner?.name, email: member.owner?.email, phone: member.owner?.phone };
  if (to === 'SUSPENDED') {
    await notify('SUSPENDED', target, reason);
  } else if (to === 'ACTIVE' && from !== 'ACTIVE') {
    await notify('REACTIVATED', target, undefined);
  }

  return { from, to };
}

/**
 * Deletes a SUSPENDED member. Only Super Admin may call this: the route gate
 * `requirePermission('members', 'delete')` enforces it, since only the Super Admin role holds
 * `members:delete`. This service never compares role names.
 *
 * A member with no order lines is hard deleted. Its branches, deals, products, therapists,
 * documents, media and status history cascade away, and the owner User stays (user data is never
 * hard deleted) but is set to `inactive` with every refresh session revoked. A member
 * with order lines, or any other row that blocks the delete (P2003), is ARCHIVED instead with
 * `archivedAt` set, so order history keeps its member.
 */
export async function deleteMember(
  memberId: string,
  rawReason: string,
  actor: StatusActor,
): Promise<{ outcome: 'DELETED' | 'ARCHIVED' }> {
  const reason = validReason(rawReason);
  const member = await loadMember(memberId);
  if (member.status !== 'SUSPENDED') {
    throw new ApiError('MEMBER_NOT_SUSPENDED', 'Suspend this member before deleting. The journey is Inactive, then Suspended, then Delete.');
  }

  const audit = (outcome: 'DELETED' | 'ARCHIVED') =>
    auditLogData({
      actorUserId: actor.userId,
      action: outcome === 'DELETED' ? 'member.deleted' : 'member.archived',
      targetType: 'Member',
      targetId: memberId,
      before: { status: 'SUSPENDED' },
      after: { outcome, reason },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

  const archive = async () => {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.member.update({
        where: { id: memberId },
        data: { status: 'ARCHIVED', archivedAt: now, statusReason: reason, statusChangedAt: now, statusChangedByUserId: actor.userId },
      });
      await tx.memberStatusHistory.create({
        data: { memberId, fromStatus: 'SUSPENDED', toStatus: 'ARCHIVED', reason, actorUserId: actor.userId },
      });
      await tx.auditLog.create({ data: audit('ARCHIVED') });
    });
  };

  const orderLines = await prisma.orderItem.count({ where: { vendorId: memberId } });
  let outcome: 'DELETED' | 'ARCHIVED' = orderLines > 0 ? 'ARCHIVED' : 'DELETED';

  if (outcome === 'ARCHIVED') {
    await archive();
  } else {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.member.delete({ where: { id: memberId } });
        if (member.ownerUserId) {
          await tx.user.update({ where: { id: member.ownerUserId }, data: { status: 'inactive' } });
          await revokeAllRefreshTokens(member.ownerUserId, tx);
        }
        await tx.auditLog.create({ data: audit('DELETED') });
      });
    } catch (err) {
      // Orders, carts or other rows still point at the member: keep the records, hide the member.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        outcome = 'ARCHIVED';
        await archive();
      } else {
        throw err;
      }
    }
  }

  if (member.ownerUserId) clearMemberAccessCache(member.ownerUserId);
  return { outcome };
}
