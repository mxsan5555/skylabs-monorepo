import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';

vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

import {
  resolvePermissionsForRoles,
  invalidatePermissionCache,
  resolveEffectivePermissionsForUser,
} from './permission.service';

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

describe('resolveEffectivePermissionsForUser', () => {
  it('returns the role-derived set unchanged when the user has no overrides', async () => {
    mockPrisma.role.findMany.mockResolvedValue([{ isSuperAdmin: false }]);
    mockPrisma.rolePermission.findMany.mockResolvedValue([{ permission: { key: 'drivers:view' } }]);
    mockPrisma.userPermissionOverride.findMany.mockResolvedValue([]);

    const result = await resolveEffectivePermissionsForUser('user-1', ['data_operator']);

    expect(result).toEqual(['drivers:view']);
  });

  it('adds a grant override the role set does not carry', async () => {
    mockPrisma.role.findMany.mockResolvedValue([{ isSuperAdmin: false }]);
    mockPrisma.rolePermission.findMany.mockResolvedValue([{ permission: { key: 'drivers:view' } }]);
    mockPrisma.userPermissionOverride.findMany.mockResolvedValue([
      { effect: 'grant', permission: { key: 'drivers:delete' } },
    ]);

    const result = await resolveEffectivePermissionsForUser('user-1', ['data_operator']);

    expect(result).toEqual(expect.arrayContaining(['drivers:view', 'drivers:delete']));
  });

  it('removes a revoke override from a permission the role would otherwise grant', async () => {
    mockPrisma.role.findMany.mockResolvedValue([{ isSuperAdmin: false }]);
    mockPrisma.rolePermission.findMany.mockResolvedValue([
      { permission: { key: 'drivers:view' } },
      { permission: { key: 'drivers:edit' } },
    ]);
    mockPrisma.userPermissionOverride.findMany.mockResolvedValue([
      { effect: 'revoke', permission: { key: 'drivers:edit' } },
    ]);

    const result = await resolveEffectivePermissionsForUser('user-1', ['kyc_verification']);

    expect(result).toEqual(['drivers:view']);
  });

  it('never applies overrides to a SuperAdmin-flagged role holder', async () => {
    mockPrisma.role.findMany.mockResolvedValue([{ isSuperAdmin: true }]);
    mockPrisma.rolePermission.findMany.mockResolvedValue([]);

    const result = await resolveEffectivePermissionsForUser('user-1', ['super_admin']);

    // Full menu-derived access, and the override table is never even queried.
    expect(result.length).toBeGreaterThan(1);
    expect(mockPrisma.userPermissionOverride.findMany).not.toHaveBeenCalled();
  });
});
