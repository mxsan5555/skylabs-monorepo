import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { resolveGrantedPermissionKeys, resolveGrantedPermissions, invalidatePermissionCache } from './permission-resolver.service';

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

  /**
   * The User Management permission matrix caps SuperAdmin to View-only on Orders/Reports, View+
   * Create on Customers (the explicit "Super Admin can add customers" carve-out), and View+Edit
   * on System Settings, DESPITE the blanket bypass above — the matrix's own explicit example is
   * "Orders stays View-only even for Super Admin". The old stub `payments` menu key this test
   * used to also assert on was removed (replaced by the real `accounts.*` domain — see
   * msd-menu.json/ACCOUNTS_SETTLEMENTS plan) — `SUPER_ADMIN_VIEW_ONLY_MENU_KEYS` still lists
   * `payments` for forward-compat but it can never match a real permission key again.
   */
  it('caps a SuperAdmin role to view-only on Orders/Reports despite the blanket bypass', async () => {
    prismaMock.role.findMany.mockResolvedValue([{ isSuperAdmin: true }]);
    prismaMock.rolePermission.findMany.mockResolvedValue([]);

    const result = await resolveGrantedPermissionKeys(['super_admin']);

    expect(result).toContain('orders:view');
    expect(result).not.toContain('orders:edit');
    expect(result).not.toContain('orders:create');
    expect(result).not.toContain('orders:delete');
    expect(result).not.toContain('orders:status_change');
    expect(result).toContain('reports:view');
    expect(result).not.toContain('reports:export');
  });

  it('caps a SuperAdmin role to view+create on Customers (can add customers, never edit/delete/status_change)', async () => {
    prismaMock.role.findMany.mockResolvedValue([{ isSuperAdmin: true }]);
    prismaMock.rolePermission.findMany.mockResolvedValue([]);

    const result = await resolveGrantedPermissionKeys(['super_admin']);

    expect(result).toContain('customers:view');
    expect(result).toContain('customers:create');
    expect(result).not.toContain('customers:edit');
    expect(result).not.toContain('customers:delete');
    expect(result).not.toContain('customers:status_change');
  });

  it('caps a SuperAdmin role to view+edit on System Settings, still full elsewhere (e.g. Members/Staff Users)', async () => {
    prismaMock.role.findMany.mockResolvedValue([{ isSuperAdmin: true }]);
    prismaMock.rolePermission.findMany.mockResolvedValue([]);

    const result = await resolveGrantedPermissionKeys(['super_admin']);

    expect(result).toContain('system-settings:view');
    expect(result).toContain('system-settings:edit');
    expect(result).not.toContain('system-settings:delete');
    expect(result).not.toContain('system-settings:create');
    // Unaffected resources keep full VCED.
    expect(result).toContain('vendors:delete');
    expect(result).toContain('rbac.users:delete');
  });
});

describe('resolveGrantedPermissions (scope)', () => {
  it('reports the scope of a single-role grant', async () => {
    prismaMock.role.findMany.mockResolvedValue([{ isSuperAdmin: false }]);
    prismaMock.rolePermission.findMany.mockResolvedValue([
      { scope: 'OWN', permission: { key: 'rbac.audit-logs:view' } },
    ]);

    const result = await resolveGrantedPermissions(['support']);

    expect(result.keys).toEqual(['rbac.audit-logs:view']);
    expect(result.scopes).toEqual({ 'rbac.audit-logs:view': 'OWN' });
  });

  it('highest-scope-wins: ALL beats OWN across two roles granting the same key', async () => {
    prismaMock.role.findMany.mockResolvedValue([{ isSuperAdmin: false }, { isSuperAdmin: false }]);
    prismaMock.rolePermission.findMany.mockResolvedValue([
      { scope: 'OWN', permission: { key: 'rbac.audit-logs:view' } },
      { scope: 'ALL', permission: { key: 'rbac.audit-logs:view' } },
    ]);

    const result = await resolveGrantedPermissions(['support', 'admin']);

    expect(result.scopes['rbac.audit-logs:view']).toBe('ALL');
  });

  it('SuperAdmin resolves with an empty scope map (scopeFor defaults absent keys to ALL)', async () => {
    prismaMock.role.findMany.mockResolvedValue([{ isSuperAdmin: true }]);
    prismaMock.rolePermission.findMany.mockResolvedValue([]);

    const result = await resolveGrantedPermissions(['super_admin']);

    expect(result.scopes).toEqual({});
    expect(prismaMock.rolePermission.findMany).not.toHaveBeenCalled();
  });
});
