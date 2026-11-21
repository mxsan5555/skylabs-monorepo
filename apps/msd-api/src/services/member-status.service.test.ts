import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});
const sendMemberNotice = vi.fn().mockResolvedValue({ email: true, sms: true });
const sendAdminStatusNotice = vi.fn().mockResolvedValue(2);
vi.mock('./member-notice.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./member-notice.service')>()),
  sendMemberNotice: (...a: unknown[]) => sendMemberNotice(...a),
  sendAdminStatusNotice: (...a: unknown[]) => sendAdminStatusNotice(...a),
}));
const clearMemberAccessCache = vi.fn();
vi.mock('./member-access.service', () => ({ clearMemberAccessCache: (...a: unknown[]) => clearMemberAccessCache(...a) }));
const deleteMediaFile = vi.fn().mockResolvedValue(undefined);
vi.mock('../lib/media-storage', () => ({ deleteMediaFile: (...a: unknown[]) => deleteMediaFile(...a) }));

import { prisma } from '../lib/prisma';
import { changeMemberStatus, deleteMember } from './member-status.service';

const prismaMock = vi.mocked(prisma, true);
const ACTOR = { userId: 'admin-1', ip: '1.1.1.1', userAgent: 'test' };
const MEMBER = {
  id: 'm1',
  status: 'ACTIVE',
  ownerUserId: 'owner-1',
  ownerEmail: 'o@x.com',
  ownerMobile: '+919876543210',
  businessName: 'Glow',
  owner: { name: 'Asha', email: 'o@x.com', phone: '+919876543210' },
};
const withStatus = (status: string) => prismaMock.member.findUnique.mockResolvedValue({ ...MEMBER, status } as never);
const REASON = 'Documents not completed';

beforeEach(() => {
  vi.clearAllMocks();
  sendMemberNotice.mockResolvedValue({ email: true, sms: true });
  sendAdminStatusNotice.mockResolvedValue(2);
  withStatus('ACTIVE');
  prismaMock.member.updateMany.mockResolvedValue({ count: 1 } as never);
  prismaMock.memberStatusHistory.create.mockResolvedValue({} as never);
  prismaMock.refreshSession.updateMany.mockResolvedValue({ count: 2 } as never);
  prismaMock.auditLog.create.mockResolvedValue({} as never);
});

/** Item 6: Active, then Inactive, then Suspended, then Delete (archive); every step can come back. */
describe('changeMemberStatus', () => {
  it('suspends an inactive member: status, history, session revocation, member and admin notices', async () => {
    withStatus('INACTIVE');
    await changeMemberStatus('m1', 'SUSPENDED', REASON, ACTOR);
    expect(prismaMock.member.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'm1', status: 'INACTIVE' },
        data: expect.objectContaining({ status: 'SUSPENDED', statusReason: REASON, statusChangedByUserId: 'admin-1' }),
      }),
    );
    expect(prismaMock.memberStatusHistory.create).toHaveBeenCalledWith({
      data: { memberId: 'm1', fromStatus: 'INACTIVE', toStatus: 'SUSPENDED', reason: REASON, actorUserId: 'admin-1' },
    });
    expect(prismaMock.refreshSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'owner-1', revokedAt: null } }));
    expect(sendMemberNotice).toHaveBeenCalledWith('SUSPENDED', expect.objectContaining({ email: 'o@x.com' }), REASON);
    expect(sendAdminStatusNotice).toHaveBeenCalledWith({ businessName: 'Glow', from: 'INACTIVE', to: 'SUSPENDED', reason: REASON });
  });

  it('refuses to suspend an active member and says to make them inactive first', async () => {
    await expect(changeMemberStatus('m1', 'SUSPENDED', REASON, ACTOR)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringMatching(/inactive first/i),
    });
    expect(prismaMock.member.updateMany).not.toHaveBeenCalled();
    expect(sendMemberNotice).not.toHaveBeenCalled();
  });

  it('writes the audit row inside the same transaction and clears the access cache', async () => {
    await changeMemberStatus('m1', 'INACTIVE', REASON, ACTOR);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'member.status.changed', targetType: 'Member', targetId: 'm1', actorUserId: 'admin-1' }),
    });
    expect(clearMemberAccessCache).toHaveBeenCalledWith('owner-1');
  });

  it('making a member inactive keeps their sessions and sends the inactive notice', async () => {
    await changeMemberStatus('m1', 'INACTIVE', 'Owner on a long holiday', ACTOR);
    expect(prismaMock.refreshSession.updateMany).not.toHaveBeenCalled();
    expect(sendMemberNotice).toHaveBeenCalledWith('INACTIVE', expect.anything(), 'Owner on a long holiday');
    expect(sendAdminStatusNotice).toHaveBeenCalledWith(expect.objectContaining({ from: 'ACTIVE', to: 'INACTIVE' }));
  });

  it.each(['SUSPENDED', 'INACTIVE'] as const)('reactivating from %s clears the reason and review flag and sends the active again notice', async (from) => {
    withStatus(from);
    await changeMemberStatus('m1', 'ACTIVE', 'Documents received and checked', ACTOR);
    expect(prismaMock.member.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE', statusReason: null, reviewFlaggedAt: null }) }),
    );
    expect(sendMemberNotice).toHaveBeenCalledWith('REACTIVATED', expect.anything(), undefined);
  });

  it('restores an archived member to inactive, clears the archive date and sends the restored notice', async () => {
    withStatus('ARCHIVED');
    await changeMemberStatus('m1', 'INACTIVE', 'Owner asked to come back', ACTOR);
    expect(prismaMock.member.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm1', status: 'ARCHIVED' }, data: expect.objectContaining({ status: 'INACTIVE', archivedAt: null }) }),
    );
    expect(sendMemberNotice).toHaveBeenCalledWith('RESTORED', expect.anything(), 'Owner asked to come back');
  });

  it('refuses to take an archived member straight to active', async () => {
    withStatus('ARCHIVED');
    await expect(changeMemberStatus('m1', 'ACTIVE', 'Owner asked to come back', ACTOR)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('keeps the review flag when the member moves further down the journey', async () => {
    withStatus('INACTIVE');
    await changeMemberStatus('m1', 'SUSPENDED', REASON, ACTOR);
    const { data } = prismaMock.member.updateMany.mock.lastCall?.[0] as { data: Record<string, unknown> };
    expect(data).not.toHaveProperty('reviewFlaggedAt');
  });

  it('a failing notice never throws into the caller', async () => {
    sendMemberNotice.mockRejectedValueOnce(new Error('smtp down'));
    sendAdminStatusNotice.mockRejectedValueOnce(new Error('smtp down'));
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    await expect(changeMemberStatus('m1', 'INACTIVE', REASON, ACTOR)).resolves.toEqual({ from: 'ACTIVE', to: 'INACTIVE' });
  });

  it('rejects a short reason with 422 before touching the database', async () => {
    await expect(changeMemberStatus('m1', 'INACTIVE', 'short', ACTOR)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.member.updateMany).not.toHaveBeenCalled();
  });

  it('404 for an unknown member', async () => {
    prismaMock.member.findUnique.mockResolvedValue(null as never);
    await expect(changeMemberStatus('nope', 'INACTIVE', 'Reason long enough', ACTOR)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('409 when the status changed under the caller: no history row, no notice', async () => {
    prismaMock.member.updateMany.mockResolvedValue({ count: 0 } as never);
    await expect(changeMemberStatus('m1', 'INACTIVE', REASON, ACTOR)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'The member status changed. Reload and try again.',
    });
    expect(prismaMock.memberStatusHistory.create).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
    expect(sendMemberNotice).not.toHaveBeenCalled();
  });
});

/** Q2 (2026-10-29): delete never erases. The member, their listings and files are kept and hidden. */
describe('deleteMember', () => {
  it('refuses unless the member is suspended', async () => {
    await expect(deleteMember('m1', 'Cleanup after suspension', ACTOR)).rejects.toMatchObject({ code: 'MEMBER_NOT_SUSPENDED' });
  });

  it('archives a suspended member even with no orders: nothing deleted, files kept, notices sent', async () => {
    withStatus('SUSPENDED');
    prismaMock.orderItem.count.mockResolvedValue(0 as never);
    const result = await deleteMember('m1', 'Cleanup after suspension', ACTOR);
    expect(result.outcome).toBe('ARCHIVED');
    expect(prismaMock.member.deleteMany).not.toHaveBeenCalled();
    expect(deleteMediaFile).not.toHaveBeenCalled();
    expect(prismaMock.member.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm1', status: 'SUSPENDED' }, data: expect.objectContaining({ status: 'ARCHIVED' }) }),
    );
    expect(prismaMock.memberStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ fromStatus: 'SUSPENDED', toStatus: 'ARCHIVED' }),
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'member.archived' }) });
    expect(clearMemberAccessCache).toHaveBeenCalledWith('owner-1');
    expect(sendMemberNotice).toHaveBeenCalledWith('ARCHIVED', expect.anything(), 'Cleanup after suspension');
    expect(sendAdminStatusNotice).toHaveBeenCalledWith(expect.objectContaining({ from: 'SUSPENDED', to: 'ARCHIVED' }));
  });

  it('409 when the archive finds the member no longer suspended', async () => {
    withStatus('SUSPENDED');
    prismaMock.member.updateMany.mockResolvedValue({ count: 0 } as never);
    await expect(deleteMember('m1', 'Cleanup after suspension', ACTOR)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prismaMock.memberStatusHistory.create).not.toHaveBeenCalled();
    expect(sendMemberNotice).not.toHaveBeenCalled();
  });
});
