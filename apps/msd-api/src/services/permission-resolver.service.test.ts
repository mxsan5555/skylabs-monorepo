import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { resolveGrantedPermissionKeys, invalidatePermissionCache } from './permission-resolver.service';

const prismaMock = vi.mocked(prisma, true);

beforeEach(() => {
  vi.clearAllMocks();
  invalidatePermissionCache();
});

describe('resolveGrantedPermissionKeys', () => {
  it('resolves a normal role from RolePermission rows only', async () => {
    prismaMock.role.findMany.mockResolvedValue([{ isSuperAdmin: false }]);
    prismaMock.rolePermission.findMany.mockResolvedValue([{ permission: { key: 'customers:view' } }]);

    const result = await resolveGrantedPermissionKeys(['sales']);

    expect(result).toEqual(['customers:view']);
  });

  it('grants a SuperAdmin-flagged role every permission key from the live menu, ignoring RolePermission entirely', async () => {
    prismaMock.role.findMany.mockResolvedValue([{ isSuperAdmin: true }]);
    // Simulates someone having unchecked/saved every box for this role in the Role
    // Management UI — RolePermission is empty, yet access must not shrink.
    prismaMock.rolePermission.findMany.mockResolvedValue([]);

    const result = await resolveGrantedPermissionKeys(['super_admin']);

    expect(result).toContain('rbac.roles:view');
    expect(result).toContain('dashboard:view');
    expect(result.length).toBeGreaterThan(1);
    expect(prismaMock.rolePermission.findMany).not.toHaveBeenCalled();
  });

  it('still grants full access for a SuperAdmin role even when RolePermission has stale/partial rows', async () => {
    prismaMock.role.findMany.mockResolvedValue([{ isSuperAdmin: true }]);
    prismaMock.rolePermission.findMany.mockResolvedValue([{ permission: { key: 'dashboard:view' } }]);

    const result = await resolveGrantedPermissionKeys(['super_admin']);

    // Not just the one stale row — the full menu-derived set.
    expect(result).toContain('rbac.users:delete');
  });
});
