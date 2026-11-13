import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { getPermissionCatalog } from './role.service';

const prismaMock = vi.mocked(prisma, true);

function permissionRow(key: string, menuKey: string, action: string) {
  return { id: `perm-${key}`, key, menuKey, action, label: `${menuKey}: ${action}` };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.permission.findMany.mockResolvedValue([] as never);
});

/**
 * Regression coverage for the catalog-key mismatch found 2026-10-27 (see ARCHITECTURE.md §1 /
 * TASKS.md P10-08): before this fix, `getPermissionCatalog()` built its rows from a parallel,
 * UI-only key space (`members`, `branches`, `deals`, ... — not `vendors.branches` etc.) that
 * `requirePermission()`/the sidebar never read, so saving a change for most rows here did
 * nothing observable. These tests pin every row to the REAL key(s) it must now control.
 */
describe('getPermissionCatalog — rows point at the real governing keys', () => {
  it('Branches/Deals/Therapists/Products use the real nested vendors.* keys, never a bare branches/deals/therapists/products key', async () => {
    const catalog = await getPermissionCatalog();
    const byId = new Map(catalog.map((row) => [row.id, row]));

    expect(byId.get('branches')?.menuKey).toBe('vendors.branches');
    expect(byId.get('deals')?.menuKey).toBe('vendors.deals');
    expect(byId.get('therapists')?.menuKey).toBe('vendors.therapists');
    expect(byId.get('products')?.menuKey).toBe('vendors.products');
  });

  it('Staff Users, System Settings, Logs and My Profile use the real rbac.users/system-settings/rbac.audit-logs/settings keys', async () => {
    const catalog = await getPermissionCatalog();
    const byId = new Map(catalog.map((row) => [row.id, row]));

    expect(byId.get('staff-users')?.menuKey).toBe('rbac.users');
    expect(byId.get('system-settings')?.menuKey).toBe('system-settings');
    expect(byId.get('audit-logs')?.menuKey).toBe('rbac.audit-logs');
    expect(byId.get('my-profile')?.menuKey).toBe('settings');
  });

  it('Members/Orders/Customers/Reports keep the same key they always had (the 4 rows that already worked)', async () => {
    const catalog = await getPermissionCatalog();
    const byId = new Map(catalog.map((row) => [row.id, row]));

    expect(byId.get('members')?.menuKey).toBe('members');
    expect(byId.get('orders')?.menuKey).toBe('orders');
    expect(byId.get('customers')?.menuKey).toBe('customers');
    expect(byId.get('reports')?.menuKey).toBe('reports');
  });

  it("Content's View action aggregates every real cms.* leaf key's permissionId, not one synthetic 'content:view'", async () => {
    prismaMock.permission.findMany.mockResolvedValue([
      permissionRow('cms:view', 'cms', 'view'),
      permissionRow('cms.blog.pages:view', 'cms.blog.pages', 'view'),
      permissionRow('cms.about-us:view', 'cms.about-us', 'view'),
    ] as never);

    const catalog = await getPermissionCatalog();
    const content = catalog.find((row) => row.id === 'content')!;
    const view = content.actions.find((a) => a.action === 'view')!;

    expect(view.permissionIds).toEqual(
      expect.arrayContaining(['perm-cms:view', 'perm-cms.blog.pages:view', 'perm-cms.about-us:view']),
    );
    expect(view.permissionIds.length).toBeGreaterThan(1);
  });

  it('Content excludes create/delete for the 3 singleton CMS pages (About Us, Contact Us, Website Pages)', async () => {
    const catalog = await getPermissionCatalog();
    const content = catalog.find((row) => row.id === 'content')!;
    const create = content.actions.find((a) => a.action === 'create')!;

    expect(create.key).not.toContain('cms.about-us');
    expect(create.key).not.toContain('cms.contact-us');
    expect(create.key).not.toContain('cms.website-pages');
    expect(create.key).toContain('cms.blog.pages');
  });

  it('upserts a Permission row for every (menuKey, action) pair the catalog declares', async () => {
    await getPermissionCatalog();
    const upsertedKeys = prismaMock.permission.upsert.mock.calls.map(
      (call) => (call[0] as { where: { key: string } }).where.key,
    );
    expect(upsertedKeys).toContain('vendors.branches:view');
    expect(upsertedKeys).toContain('rbac.users:create');
    expect(upsertedKeys).toContain('cms.blog.pages:delete');
    // Singleton CMS pages never get a create/delete row.
    expect(upsertedKeys).not.toContain('cms.about-us:create');
  });
});
