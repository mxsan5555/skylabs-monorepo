import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});
const sendMemberNotice = vi.fn().mockResolvedValue({ email: true, sms: true });
vi.mock('./member-notice.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./member-notice.service')>()),
  sendMemberNotice: (...a: unknown[]) => sendMemberNotice(...a),
}));
const clearMemberAccessCache = vi.fn();
vi.mock('./member-access.service', () => ({ clearMemberAccessCache: (...a: unknown[]) => clearMemberAccessCache(...a) }));
const deleteMediaFile = vi.fn().mockResolvedValue(undefined);
vi.mock('../lib/media-storage', () => ({ deleteMediaFile: (...a: unknown[]) => deleteMediaFile(...a) }));

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
  prismaMock.member.updateMany.mockResolvedValue({ count: 1 } as never);
  prismaMock.member.deleteMany.mockResolvedValue({ count: 1 } as never);
  prismaMock.memberDocument.findMany.mockResolvedValue([] as never);
  prismaMock.vendorImage.findMany.mockResolvedValue([] as never);
  prismaMock.vendorVideo.findUnique.mockResolvedValue(null as never);
  for (const model of [
    prismaMock.dealImage,
    prismaMock.dealVideo,
    prismaMock.productImage,
    prismaMock.productVideo,
    prismaMock.therapistImage,
    prismaMock.therapistVideo,
  ]) {
    model.findMany.mockResolvedValue([] as never);
  }
  deleteMediaFile.mockResolvedValue(undefined);
  prismaMock.memberStatusHistory.create.mockResolvedValue({} as never);
  prismaMock.refreshSession.updateMany.mockResolvedValue({ count: 2 } as never);
  prismaMock.auditLog.create.mockResolvedValue({} as never);
});

describe('changeMemberStatus', () => {
  it('suspends: updates status, writes history, revokes sessions and notifies', async () => {
    await changeMemberStatus('m1', 'SUSPENDED', 'Documents not completed', ACTOR);

    expect(prismaMock.member.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'm1', status: 'ACTIVE' },
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
    expect(prismaMock.member.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE', statusReason: null, reviewFlaggedAt: null }) }),
    );
    expect(sendMemberNotice).toHaveBeenCalledWith('REACTIVATED', expect.anything(), undefined);
  });

  it.each([
    ['ACTIVE', 'INACTIVE'],
    ['ACTIVE', 'SUSPENDED'],
    ['INACTIVE', 'SUSPENDED'],
  ] as const)('%s to %s keeps the review flag for the admin who decides next', async (from, to) => {
    prismaMock.member.findUnique.mockResolvedValue({ ...MEMBER, status: from } as never);
    await changeMemberStatus('m1', to, 'Documents not completed', ACTOR);
    const { data } = prismaMock.member.updateMany.mock.lastCall?.[0] as { data: Record<string, unknown> };
    expect(data).not.toHaveProperty('reviewFlaggedAt');
  });

  it('reactivating from inactive also clears the review flag', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ ...MEMBER, status: 'INACTIVE' } as never);
    await changeMemberStatus('m1', 'ACTIVE', 'Back from the long holiday', ACTOR);
    const { data } = prismaMock.member.updateMany.mock.lastCall?.[0] as { data: Record<string, unknown> };
    expect(data.reviewFlaggedAt).toBeNull();
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
    expect(prismaMock.member.updateMany).not.toHaveBeenCalled();
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
    prismaMock.user.update.mockResolvedValue({} as never);
    const result = await deleteMember('m1', 'Cleanup after suspension', ACTOR);
    expect(result.outcome).toBe('DELETED');
    expect(prismaMock.member.deleteMany).toHaveBeenCalledWith({ where: { id: 'm1', status: 'SUSPENDED' } });
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: 'owner-1' }, data: { status: 'inactive' } });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'member.deleted' }) });
    expect(clearMemberAccessCache).toHaveBeenCalledWith('owner-1');
  });

  it('archives a suspended member that has orders', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ ...MEMBER, status: 'SUSPENDED' } as never);
    prismaMock.orderItem.count.mockResolvedValue(3 as never);
    const result = await deleteMember('m1', 'Cleanup after suspension', ACTOR);
    expect(result.outcome).toBe('ARCHIVED');
    expect(prismaMock.member.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.member.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm1', status: 'SUSPENDED' }, data: expect.objectContaining({ status: 'ARCHIVED' }) }),
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
    prismaMock.member.deleteMany.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'test' }),
    );
    const result = await deleteMember('m1', 'Cleanup after suspension', ACTOR);
    expect(result.outcome).toBe('ARCHIVED');
    expect(prismaMock.member.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ARCHIVED' }) }),
    );
  });
});

describe('status writes are conditional on the status read before the transaction', () => {
  it('409 when the status changed under the caller: no history row, no notice', async () => {
    prismaMock.member.updateMany.mockResolvedValue({ count: 0 } as never);
    await expect(changeMemberStatus('m1', 'SUSPENDED', 'Documents not completed', ACTOR)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'The member status changed. Reload and try again.',
    });
    expect(prismaMock.memberStatusHistory.create).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
    expect(prismaMock.refreshSession.updateMany).not.toHaveBeenCalled();
    expect(sendMemberNotice).not.toHaveBeenCalled();
  });

  it('409 when a hard delete finds the member no longer suspended', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ ...MEMBER, status: 'SUSPENDED' } as never);
    prismaMock.orderItem.count.mockResolvedValue(0 as never);
    prismaMock.member.deleteMany.mockResolvedValue({ count: 0 } as never);
    await expect(deleteMember('m1', 'Cleanup after suspension', ACTOR)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
    expect(deleteMediaFile).not.toHaveBeenCalled();
  });

  it('409 when an archive finds the member no longer suspended', async () => {
    prismaMock.member.findUnique.mockResolvedValue({ ...MEMBER, status: 'SUSPENDED' } as never);
    prismaMock.orderItem.count.mockResolvedValue(3 as never);
    prismaMock.member.updateMany.mockResolvedValue({ count: 0 } as never);
    await expect(deleteMember('m1', 'Cleanup after suspension', ACTOR)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prismaMock.memberStatusHistory.create).not.toHaveBeenCalled();
  });
});

describe('hard delete removes the member files from storage', () => {
  beforeEach(() => {
    prismaMock.member.findUnique.mockResolvedValue({ ...MEMBER, status: 'SUSPENDED' } as never);
    prismaMock.orderItem.count.mockResolvedValue(0 as never);
    prismaMock.user.update.mockResolvedValue({} as never);
    prismaMock.memberDocument.findMany.mockResolvedValue([{ storageKey: 'vendor-documents/m1/a.pdf' }, { storageKey: 'members/m1/documents/b.pdf' }] as never);
    prismaMock.vendorImage.findMany.mockResolvedValue([
      { storageKey: 'vendors/m1/1.jpg' },
      { storageKey: 'vendors/m1/2.jpg' },
    ] as never);
    prismaMock.vendorVideo.findUnique.mockResolvedValue({ storageKey: 'vendors/m1/v.mp4' } as never);
    // P3-25: the member's deals, products and therapists cascade away with it, so their media too.
    prismaMock.dealImage.findMany.mockResolvedValue([{ storageKey: 'deals/d1/1.jpg' }] as never);
    prismaMock.dealVideo.findMany.mockResolvedValue([{ storageKey: 'deals/d1/v.mp4' }] as never);
    prismaMock.productImage.findMany.mockResolvedValue([{ storageKey: 'products/p1/1.jpg' }] as never);
    prismaMock.productVideo.findMany.mockResolvedValue([] as never);
    prismaMock.therapistImage.findMany.mockResolvedValue([{ storageKey: 'therapists/t1/1.jpg' }] as never);
    prismaMock.therapistVideo.findMany.mockResolvedValue([{ storageKey: 'therapists/t1/v.mp4' }] as never);
  });

  it('also deletes the media of the deals, products and therapists the member owns (P3-25)', async () => {
    await deleteMember('m1', 'Cleanup after suspension', ACTOR);
    for (const key of ['deals/d1/1.jpg', 'deals/d1/v.mp4', 'products/p1/1.jpg', 'therapists/t1/1.jpg', 'therapists/t1/v.mp4']) {
      expect(deleteMediaFile).toHaveBeenCalledWith(key, 'public');
    }
    // Every lookup is scoped to this member's own rows.
    for (const model of [prismaMock.dealImage, prismaMock.dealVideo]) {
      expect(model.findMany).toHaveBeenCalledWith({ where: { deal: { vendorId: 'm1' } }, select: { storageKey: true } });
    }
    for (const model of [prismaMock.productImage, prismaMock.productVideo]) {
      expect(model.findMany).toHaveBeenCalledWith({ where: { product: { vendorId: 'm1' } }, select: { storageKey: true } });
    }
    for (const model of [prismaMock.therapistImage, prismaMock.therapistVideo]) {
      expect(model.findMany).toHaveBeenCalledWith({ where: { therapist: { vendorId: 'm1' } }, select: { storageKey: true } });
    }
  });

  it('deletes every key once, after the transaction commits', async () => {
    await deleteMember('m1', 'Cleanup after suspension', ACTOR);
    expect(deleteMediaFile).toHaveBeenCalledTimes(10);
    for (const key of ['vendor-documents/m1/a.pdf', 'vendors/m1/1.jpg', 'vendors/m1/2.jpg', 'vendors/m1/v.mp4']) {
      expect(deleteMediaFile).toHaveBeenCalledWith(key, 'public');
    }
    // Documents uploaded since the private bucket are removed from the private bucket.
    expect(deleteMediaFile).toHaveBeenCalledWith('members/m1/documents/b.pdf', 'private');
    const committedAt = prismaMock.$transaction.mock.invocationCallOrder[0];
    expect(deleteMediaFile.mock.invocationCallOrder.every((order) => order > committedAt)).toBe(true);
  });

  it('keeps the files when the member is archived through the P2003 fallback', async () => {
    prismaMock.member.deleteMany.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'test' }),
    );
    const result = await deleteMember('m1', 'Cleanup after suspension', ACTOR);
    expect(result.outcome).toBe('ARCHIVED');
    expect(deleteMediaFile).not.toHaveBeenCalled();
  });

  it('keeps the files when the member has orders and is archived', async () => {
    prismaMock.orderItem.count.mockResolvedValue(2 as never);
    await deleteMember('m1', 'Cleanup after suspension', ACTOR);
    expect(deleteMediaFile).not.toHaveBeenCalled();
  });

  it('a storage failure never fails the delete and logs the count only', async () => {
    deleteMediaFile.mockRejectedValue(new Error('r2 down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());
    await expect(deleteMember('m1', 'Cleanup after suspension', ACTOR)).resolves.toEqual({ outcome: 'DELETED' });
    expect(deleteMediaFile).toHaveBeenCalledTimes(10);
    const logged = JSON.stringify(errorSpy.mock.calls.map((c) => c.map((a) => (a instanceof Error ? a.message : a))));
    expect(logged).not.toContain('vendors/m1');
    expect(logged).not.toContain('vendor-documents');
    expect(logged).not.toContain('members/m1');
    expect(logged).not.toContain('deals/d1');
    errorSpy.mockRestore();
  });
});
