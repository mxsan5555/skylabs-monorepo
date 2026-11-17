import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { auditLogData } from './audit.service';
import { revokeAllRefreshTokens } from './token.service';
import { clearMemberAccessCache } from './member-access.service';
import {
  NOTICE_OWNER_SELECT,
  noticeTargetOf,
  sendAdminStatusNotice,
  sendMemberNotice,
  type MemberNoticeKind,
  type MemberNoticeTarget,
} from './member-notice.service';
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
  owner: NOTICE_OWNER_SELECT,
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

const STATUS_CHANGED = 'The member status changed. Reload and try again.';

/** Throws 409 when a conditional write matched no row: someone moved the member first. */
function assertWritten(result: { count: number }): void {
  if (result.count === 0) throw new ApiError('CONFLICT', STATUS_CHANGED);
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

/** Tells the staff who manage member statuses (item 6). After commit; never throws. */
async function notifyAdmins(businessName: string | null, from: MemberStatusValue, to: MemberStatusValue, reason: string): Promise<void> {
  try {
    await sendAdminStatusNotice({ businessName, from, to, reason });
  } catch (err) {
    console.error({ err, context: 'admin status notice failed after status change', to });
  }
}

/** The member notice for a move: every step tells the member what changed and what comes next. */
function noticeFor(from: MemberStatusValue, to: SettableMemberStatus): MemberNoticeKind {
  if (to === 'SUSPENDED') return 'SUSPENDED';
  if (to === 'ACTIVE') return 'REACTIVATED';
  return from === 'ARCHIVED' ? 'RESTORED' : 'INACTIVE';
}

/**
 * Moves a member along the journey (ACTIVE, INACTIVE, SUSPENDED) or restores an ARCHIVED one to
 * INACTIVE (item 6). The status update, the history row,
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
    // Conditional on the status read above, so a concurrent change cannot be overwritten.
    const written = await tx.member.updateMany({
      where: { id: memberId, status: from },
      data: {
        status: to,
        statusReason: to === 'ACTIVE' ? null : reason,
        statusChangedAt: now,
        statusChangedByUserId: actor.userId,
        ...(to === 'ACTIVE' ? { reviewFlaggedAt: null } : {}),
        ...(from === 'ARCHIVED' ? { archivedAt: null } : {}),
      },
    });
    assertWritten(written);
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

  const kind = noticeFor(from, to);
  await notify(kind, noticeTargetOf(member.owner), kind === 'REACTIVATED' ? undefined : reason);
  await notifyAdmins(member.businessName, from, to, reason);

  return { from, to };
}

/**
 * "Deletes" a SUSPENDED member. Only Super Admin may call this: the route gate
 * `requirePermission('members', 'delete')` enforces it, since only the Super Admin role holds
 * `members:delete`. This service never compares role names.
 *
 * Delete never erases (item 6, decision Q2 on 2026-10-29): the member is ARCHIVED with
 * `archivedAt` set, which hides them, their branches, deals, products and therapists everywhere
 * and keeps every row and file, so an admin can restore them to Inactive later. The member and
 * the admins get a notice.
 */
export async function deleteMember(memberId: string, rawReason: string, actor: StatusActor): Promise<{ outcome: 'ARCHIVED' }> {
  const reason = validReason(rawReason);
  const member = await loadMember(memberId);
  if (member.status !== 'SUSPENDED') {
    throw new ApiError('MEMBER_NOT_SUSPENDED', 'Suspend this member before deleting. The journey is Inactive, then Suspended, then Delete.');
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const written = await tx.member.updateMany({
      where: { id: memberId, status: 'SUSPENDED' },
      data: { status: 'ARCHIVED', archivedAt: now, statusReason: reason, statusChangedAt: now, statusChangedByUserId: actor.userId },
    });
    assertWritten(written);
    await tx.memberStatusHistory.create({
      data: { memberId, fromStatus: 'SUSPENDED', toStatus: 'ARCHIVED', reason, actorUserId: actor.userId },
    });
    await tx.auditLog.create({
      data: auditLogData({
        actorUserId: actor.userId,
        action: 'member.archived',
        targetType: 'Member',
        targetId: memberId,
        before: { status: 'SUSPENDED' },
        after: { outcome: 'ARCHIVED', reason },
        ip: actor.ip,
        userAgent: actor.userAgent,
      }),
    });
  });

  if (member.ownerUserId) clearMemberAccessCache(member.ownerUserId);
  await notify('ARCHIVED', noticeTargetOf(member.owner), reason);
  await notifyAdmins(member.businessName, 'SUSPENDED', 'ARCHIVED', reason);
  return { outcome: 'ARCHIVED' };
}
