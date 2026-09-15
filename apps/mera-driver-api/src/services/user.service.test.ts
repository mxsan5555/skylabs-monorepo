import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';

vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('./token.service', () => ({ revokeAllSessionsForUser: vi.fn() }));

import { setUserStatus, softDeleteUser, removeRoleFromUser } from './user.service';

beforeEach(() => {
  resetPrismaMock();
  mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1', deletedAt: null });
  mockPrisma.user.update.mockResolvedValue({});
});

describe('self-lockout protection', () => {
  it('blocks deactivating the last active Super Admin', async () => {
    mockPrisma.userRole.count.mockResolvedValue(1); // target holds an isSuperAdmin role
    mockPrisma.user.count.mockResolvedValue(0); // no other active Super Admin exists

    await expect(setUserStatus('user-1', 'inactive')).rejects.toMatchObject({ code: 'LAST_SUPER_ADMIN' });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('allows deactivating a Super Admin when another active one exists', async () => {
    mockPrisma.userRole.count.mockResolvedValue(1);
    mockPrisma.user.count.mockResolvedValue(1); // one other active Super Admin

    await expect(setUserStatus('user-1', 'inactive')).resolves.toBeDefined();
    expect(mockPrisma.user.update).toHaveBeenCalled();
  });

  it('allows deactivating a non-Super-Admin user regardless of Super Admin headcount', async () => {
    mockPrisma.userRole.count.mockResolvedValue(0); // target holds no isSuperAdmin role

    await expect(setUserStatus('user-1', 'inactive')).resolves.toBeDefined();
    expect(mockPrisma.user.count).not.toHaveBeenCalled();
  });

  it('allows re-activating a user without the lockout check (only deactivation/blocking is guarded)', async () => {
    await setUserStatus('user-1', 'active');
    expect(mockPrisma.userRole.count).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).toHaveBeenCalled();
  });

  it('blocks soft-deleting the last active Super Admin', async () => {
    mockPrisma.userRole.count.mockResolvedValue(1);
    mockPrisma.user.count.mockResolvedValue(0);

    await expect(softDeleteUser('user-1')).rejects.toMatchObject({ code: 'LAST_SUPER_ADMIN' });
  });

  it('blocks removing a user\'s only Super Admin role when they are the last one', async () => {
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-1', isSuperAdmin: true });
    mockPrisma.userRole.count
      .mockResolvedValueOnce(0) // no other isSuperAdmin role on this user besides the one being removed
      .mockResolvedValueOnce(1); // isSuperAdminUser() check inside the guard
    mockPrisma.user.count.mockResolvedValue(0);

    await expect(removeRoleFromUser('user-1', 'role-1')).rejects.toMatchObject({ code: 'LAST_SUPER_ADMIN' });
    expect(mockPrisma.userRole.deleteMany).not.toHaveBeenCalled();
  });

  it('allows removing a non-SuperAdmin role with no lockout check', async () => {
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-2', isSuperAdmin: false });
    mockPrisma.userRole.deleteMany.mockResolvedValue({ count: 1 });

    await removeRoleFromUser('user-1', 'role-2');
    expect(mockPrisma.user.count).not.toHaveBeenCalled();
    expect(mockPrisma.userRole.deleteMany).toHaveBeenCalled();
  });
});
