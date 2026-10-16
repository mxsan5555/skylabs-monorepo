import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});
const sendMemberNotice = vi.fn().mockResolvedValue({ email: true, sms: true });
vi.mock('./member-notice.service', () => ({ sendMemberNotice: (...a: unknown[]) => sendMemberNotice(...a) }));
const clearMemberAccessCache = vi.fn();
vi.mock('./member-access.service', () => ({ clearMemberAccessCache: (...a: unknown[]) => clearMemberAccessCache(...a) }));

import { prisma } from '../lib/prisma';
import { Prisma } from '../generated/prisma-client';
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

beforeEach(() => {
  vi.clearAllMocks();
  sendMemberNotice.mockResolvedValue({ email: true, sms: true });
  prismaMock.member.findUnique.mockResolvedValue({ ...MEMBER } as never);
  prismaMock.member.update.mockResolvedValue({} as never);
  prismaMock.memberStatusHistory.create.mockResolvedValue({} as never);
  prismaMock.refreshSession.updateMany.mockResolvedValue({ count: 2 } as never);
  prismaMock.auditLog.create.mockResolvedValue({} as never);
});

describe('changeMemberStatus', () => {
  it('suspends: updates status, writes history, revokes sessions and notifies', async () => {
    await changeMemberStatus('m1', 'SUSPENDED', 'Documents not completed', ACTOR);

    expect(prismaMock.member.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'm1' },
        data: expect.objectContaining({ status: 'SUSPENDED', statusReason: 'Documents not completed', statusChangedByUserId: 'admin-1' }),
      }),
    );
    expect(prismaMock.memberStatusHistory.create).toHaveBeenCalledWith({
      data: { memberId: 'm1', fromStatus: 'ACTIVE', toStatus: 'SUSPENDED', reason: 'Documents not completed', actorUserId: 'admin-1' },
    });
    expect(prismaMock.refreshSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'owner-1', revokedAt: null } }),
    );
    expect(sendMemberNotice).toHaveBeenCalledWith('SUSPENDED', expect.objectContaining({ email: 'o@x.com' }), 'Documents not completed');
  });

  it('writes the audit row inside the same transaction and clears the access cache', async () => {
    await changeMemberStatus('m1', 'SUSPENDED', 'Documents not completed', ACTOR);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'member.status.changed', targetType: 'Member', targetId: 'm1', actorUserId: 'admin-1' }),
    });
    expect(clearMemberAccessCache).toHaveBeenCalledWith('owner-1');
  });

  it('inactive does not revoke sessions or notify', async () => {
    await changeMemberStatus('m1', 'INACTIVE', 'Owner on a long holiday', ACTOR);
    expect(prismaMock.refreshSession.updateMany).not.toHaveBeenCalled();
    expect(sendMemberNotice).not.toHaveBeenCalled();
    expect(clearMemberAccessCache).toHaveBeenCalledWith('owner-1');
  });

  it('reactivating clears the reason and sends the active again notice', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ ...MEMBER, status: 'SUSPENDED' } as never);
    await changeMemberStatus('m1', 'ACTIVE', 'Documents received and checked', ACTOR);
    expect(prismaMock.member.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE', statusReason: null, reviewFlaggedAt: null }) }),
    );
    expect(sendMemberNotice).toHaveBeenCalledWith('REACTIVATED', expect.anything(), undefined);
  });

  it('a failing notice never throws into the caller', async () => {
    sendMemberNotice.mockRejectedValueOnce(new Error('smtp down'));
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    await expect(changeMemberStatus('m1', 'SUSPENDED', 'Documents not completed', ACTOR)).resolves.toEqual({
      from: 'ACTIVE',
      to: 'SUSPENDED',
    });
  });

  it('rejects a short reason with 422 before touching the database', async () => {
    await expect(changeMemberStatus('m1', 'SUSPENDED', 'short', ACTOR)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.member.update).not.toHaveBeenCalled();
  });

  it('refuses SUSPENDED to INACTIVE with 409', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ ...MEMBER, status: 'SUSPENDED' } as never);
    await expect(changeMemberStatus('m1', 'INACTIVE', 'Not allowed route here', ACTOR)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('404 for an unknown member', async () => {
    prismaMock.member.findUnique.mockResolvedValue(null as never);
    await expect(changeMemberStatus('nope', 'INACTIVE', 'Reason long enough', ACTOR)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('deleteMember', () => {
  it('refuses unless the member is suspended', async () => {
    await expect(deleteMember('m1', 'Cleanup after suspension', ACTOR)).rejects.toMatchObject({ code: 'MEMBER_NOT_SUSPENDED' });
  });

  it('hard deletes a suspended member with no orders and disables the owner login', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ ...MEMBER, status: 'SUSPENDED' } as never);
    prismaMock.orderItem.count.mockResolvedValue(0 as never);
    prismaMock.member.delete.mockResolvedValue({} as never);
    prismaMock.user.update.mockResolvedValue({} as never);
    const result = await deleteMember('m1', 'Cleanup after suspension', ACTOR);
    expect(result.outcome).toBe('DELETED');
    expect(prismaMock.member.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: 'owner-1' }, data: { status: 'inactive' } });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'member.deleted' }) });
    expect(clearMemberAccessCache).toHaveBeenCalledWith('owner-1');
  });

  it('archives a suspended member that has orders', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ ...MEMBER, status: 'SUSPENDED' } as never);
    prismaMock.orderItem.count.mockResolvedValue(3 as never);
    const result = await deleteMember('m1', 'Cleanup after suspension', ACTOR);
    expect(result.outcome).toBe('ARCHIVED');
    expect(prismaMock.member.delete).not.toHaveBeenCalled();
    expect(prismaMock.member.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ARCHIVED' }) }),
    );
    expect(prismaMock.memberStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ fromStatus: 'SUSPENDED', toStatus: 'ARCHIVED' }),
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'member.archived' }) });
    expect(clearMemberAccessCache).toHaveBeenCalledWith('owner-1');
  });

  it('falls back to archive when a foreign key still points at the member', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ ...MEMBER, status: 'SUSPENDED' } as never);
    prismaMock.orderItem.count.mockResolvedValue(0 as never);
    prismaMock.member.delete.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'test' }),
    );
    const result = await deleteMember('m1', 'Cleanup after suspension', ACTOR);
    expect(result.outcome).toBe('ARCHIVED');
    expect(prismaMock.member.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ARCHIVED' }) }),
    );
  });
});
