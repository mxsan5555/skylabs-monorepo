import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';

vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

import { resolvePermissionsForRoles, invalidatePermissionCache } from './permission.service';

beforeEach(() => {
  resetPrismaMock();
  invalidatePermissionCache();
});

describe('resolvePermissionsForRoles', () => {
  it('resolves a normal role from RolePermission rows only', async () => {
    mockPrisma.role.findMany.mockResolvedValue([{ isSuperAdmin: false }]);
    mockPrisma.rolePermission.findMany.mockResolvedValue([{ permission: { key: 'drivers:view' } }]);

    const result = await resolvePermissionsForRoles(['dispatcher']);

    expect(result).toEqual(['drivers:view']);
  });

  it('grants a SuperAdmin-flagged role every permission key from the live menu, ignoring RolePermission entirely', async () => {
    mockPrisma.role.findMany.mockResolvedValue([{ isSuperAdmin: true }]);
    // Simulates someone having unchecked/saved every box for this role in the Role
    // Management UI — RolePermission is empty, yet access must not shrink.
    mockPrisma.rolePermission.findMany.mockResolvedValue([]);

    const result = await resolvePermissionsForRoles(['super_admin']);

    expect(result).toContain('rbac.roles:view');
    expect(result).toContain('dashboard:view');
    expect(result.length).toBeGreaterThan(1);
    expect(mockPrisma.rolePermission.findMany).not.toHaveBeenCalled();
  });

  it('still grants full access for a SuperAdmin role even when RolePermission has stale/partial rows', async () => {
    mockPrisma.role.findMany.mockResolvedValue([{ isSuperAdmin: true }]);
    mockPrisma.rolePermission.findMany.mockResolvedValue([{ permission: { key: 'dashboard:view' } }]);

    const result = await resolvePermissionsForRoles(['super_admin']);

    expect(result).toContain('rbac.users:delete');
  });
});
