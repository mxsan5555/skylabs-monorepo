import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPrismaMock } from '../test-utils/prisma-mock';
import { migrateSharedKeySplitGrants, applyPermissionMatrix } from './permission-migration.service';

const prismaMock = createPrismaMock();

const OLD_VIEW_ID = 'old-perm-view';
const OLD_CREATE_ID = 'old-perm-create';
const NEW_PAGES_VIEW_ID = 'new-pages-view';
const NEW_PAGES_CREATE_ID = 'new-pages-create';
const NEW_ARTICLES_VIEW_ID = 'new-articles-view';
const NEW_ARTICLES_CREATE_ID = 'new-articles-create';

const permissionIdByKey = new Map<string, string>([
  ['cms.blog.pages:view', NEW_PAGES_VIEW_ID],
  ['cms.blog.pages:create', NEW_PAGES_CREATE_ID],
  ['cms.blog.articles:view', NEW_ARTICLES_VIEW_ID],
  ['cms.blog.articles:create', NEW_ARTICLES_CREATE_ID],
  // No 'cms.blog.pages:edit'/'cms.blog.articles:edit' entries — simulates an action the new
  // keys don't grant at all, so a stray old grant for it must be silently dropped, not crash.
]);

const splits = [{ oldMenuKey: 'cms.blog', newMenuKeys: ['cms.blog.pages', 'cms.blog.articles'] }];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('migrateSharedKeySplitGrants — first run (old key still present)', () => {
  it('propagates each grant onto every new key, per role, matching exactly the actions that role held', async () => {
    prismaMock.permission.findMany.mockResolvedValue([
      { id: OLD_VIEW_ID, menuKey: 'cms.blog', action: 'view' },
      { id: OLD_CREATE_ID, menuKey: 'cms.blog', action: 'create' },
    ]);
    prismaMock.rolePermission.findMany.mockResolvedValue([
      { roleId: 'role-A', permissionId: OLD_VIEW_ID, permission: { action: 'view' } },
      { roleId: 'role-A', permissionId: OLD_CREATE_ID, permission: { action: 'create' } },
      { roleId: 'role-B', permissionId: OLD_VIEW_ID, permission: { action: 'view' } },
    ]);

    await migrateSharedKeySplitGrants(prismaMock as never, splits, permissionIdByKey);

    expect(prismaMock.rolePermission.createMany).toHaveBeenCalledExactlyOnceWith({
      data: expect.arrayContaining([
        { roleId: 'role-A', permissionId: NEW_PAGES_VIEW_ID },
        { roleId: 'role-A', permissionId: NEW_ARTICLES_VIEW_ID },
        { roleId: 'role-A', permissionId: NEW_PAGES_CREATE_ID },
        { roleId: 'role-A', permissionId: NEW_ARTICLES_CREATE_ID },
        { roleId: 'role-B', permissionId: NEW_PAGES_VIEW_ID },
        { roleId: 'role-B', permissionId: NEW_ARTICLES_VIEW_ID },
      ]),
      skipDuplicates: true,
    });
    const data = prismaMock.rolePermission.createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(6); // role-B never held 'create', so it gets no pages/articles:create grant
  });

  it('retires the old key by deleting its Permission rows after migrating', async () => {
    prismaMock.permission.findMany.mockResolvedValue([{ id: OLD_VIEW_ID, menuKey: 'cms.blog', action: 'view' }]);
    prismaMock.rolePermission.findMany.mockResolvedValue([
      { roleId: 'role-A', permissionId: OLD_VIEW_ID, permission: { action: 'view' } },
    ]);

    await migrateSharedKeySplitGrants(prismaMock as never, splits, permissionIdByKey);

    expect(prismaMock.permission.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: { in: [OLD_VIEW_ID] } },
    });
  });

  it('silently drops a grant for an action the new keys have no matching permission for, rather than crashing', async () => {
    prismaMock.permission.findMany.mockResolvedValue([{ id: 'old-edit', menuKey: 'cms.blog', action: 'edit' }]);
    prismaMock.rolePermission.findMany.mockResolvedValue([
      { roleId: 'role-A', permissionId: 'old-edit', permission: { action: 'edit' } }, // no 'edit' entry in permissionIdByKey
    ]);

    await expect(migrateSharedKeySplitGrants(prismaMock as never, splits, permissionIdByKey)).resolves.not.toThrow();
    // Nothing to migrate for 'edit' — createMany still runs, just with an empty/no-op payload gate.
    expect(prismaMock.rolePermission.createMany).not.toHaveBeenCalled();
    expect(prismaMock.permission.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { id: { in: ['old-edit'] } } });
  });

  it('grants nothing for a role that never held the old permission', async () => {
    prismaMock.permission.findMany.mockResolvedValue([{ id: OLD_VIEW_ID, menuKey: 'cms.blog', action: 'view' }]);
    prismaMock.rolePermission.findMany.mockResolvedValue([]); // no role ever held it

    await migrateSharedKeySplitGrants(prismaMock as never, splits, permissionIdByKey);

    expect(prismaMock.rolePermission.createMany).not.toHaveBeenCalled();
  });
});

describe('migrateSharedKeySplitGrants — genuinely one-time (regression for the re-grant-after-revoke bug)', () => {
  it('is a true no-op once the old key has already been deleted — no queries beyond the existence check', async () => {
    prismaMock.permission.findMany.mockResolvedValue([]); // already migrated by a prior run

    await migrateSharedKeySplitGrants(prismaMock as never, splits, permissionIdByKey);

    expect(prismaMock.rolePermission.findMany).not.toHaveBeenCalled();
    expect(prismaMock.rolePermission.createMany).not.toHaveBeenCalled();
    expect(prismaMock.permission.deleteMany).not.toHaveBeenCalled();
  });

  it('never resurrects a permission an admin explicitly revoked after the first migration ran', async () => {
    // Run 1: old key present, role-A holds it — migrates + retires the old key (matches the
    // "first run" behavior proven above).
    prismaMock.permission.findMany.mockResolvedValueOnce([{ id: OLD_VIEW_ID, menuKey: 'cms.blog', action: 'view' }]);
    prismaMock.rolePermission.findMany.mockResolvedValueOnce([
      { roleId: 'role-A', permissionId: OLD_VIEW_ID, permission: { action: 'view' } },
    ]);
    await migrateSharedKeySplitGrants(prismaMock as never, splits, permissionIdByKey);
    expect(prismaMock.rolePermission.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.permission.deleteMany).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();

    // Between run 1 and run 2: an admin opens the Role Permission Matrix, unchecks
    // "Pages -> View" for role-A, and saves — role-A's RolePermission for NEW_PAGES_VIEW_ID is
    // now gone (setRolePermissions' replace-the-set). The old key is already deleted (run 1), so
    // this run 2 must find nothing to migrate at all, regardless of role-A's current grants.
    prismaMock.permission.findMany.mockResolvedValueOnce([]); // old 'cms.blog' Permission rows no longer exist

    await migrateSharedKeySplitGrants(prismaMock as never, splits, permissionIdByKey);

    // The revoked grant must never be re-created — the function shouldn't even look at
    // RolePermission on this run, since there's no old key left to derive anything from.
    expect(prismaMock.rolePermission.findMany).not.toHaveBeenCalled();
    expect(prismaMock.rolePermission.createMany).not.toHaveBeenCalled();
  });

  it('re-running with a mix of already-migrated and still-pending splits only touches the pending one', async () => {
    const twoSplits = [
      { oldMenuKey: 'cms.blog', newMenuKeys: ['cms.blog.pages', 'cms.blog.articles'] },
      { oldMenuKey: 'already.done', newMenuKeys: ['already.done.a', 'already.done.b'] },
    ];
    prismaMock.permission.findMany
      .mockResolvedValueOnce([{ id: OLD_VIEW_ID, menuKey: 'cms.blog', action: 'view' }]) // still pending
      .mockResolvedValueOnce([]); // already.done — already migrated on a prior run
    prismaMock.rolePermission.findMany.mockResolvedValueOnce([
      { roleId: 'role-A', permissionId: OLD_VIEW_ID, permission: { action: 'view' } },
    ]);

    await migrateSharedKeySplitGrants(prismaMock as never, twoSplits, permissionIdByKey);

    expect(prismaMock.permission.findMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.rolePermission.findMany).toHaveBeenCalledTimes(1); // only for the pending split
    expect(prismaMock.rolePermission.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.permission.deleteMany).toHaveBeenCalledTimes(1); // only the pending split's old rows
  });
});

/**
 * `applyPermissionMatrix` — the User Management permission matrix's idempotent, exact-state
 * apply function (`prisma/permission-matrix.ts`). Proves: (1) only governed menuKeys are reset
 * for a role, (2) a role absent from the grants map is left completely untouched, (3) a role
 * named in the grants map but not present in `roles` (not yet created in this environment) is
 * skipped rather than crashing, (4) an empty grant list for a role still clears its existing
 * governed-key grants (a matrix row of all "-").
 */
describe('applyPermissionMatrix', () => {
  const roles = new Map([
    ['admin', { id: 'role-admin' }],
    ['marketing', { id: 'role-marketing' }],
  ]);
  const permissionIdByKey = new Map([
    ['orders:view', 'perm-orders-view'],
    ['customers:view', 'perm-customers-view'],
    ['vendors:delete', 'perm-vendors-delete'],
  ]);
  const governedMenuKeys = ['orders', 'customers', 'vendors'];

  it('resets exactly the governed-key grant for a role named in the matrix', async () => {
    await applyPermissionMatrix(
      prismaMock as never,
      roles,
      permissionIdByKey,
      { admin: ['orders:view', 'customers:view'] },
      governedMenuKeys,
    );

    expect(prismaMock.rolePermission.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { roleId: 'role-admin', permission: { menuKey: { in: governedMenuKeys }, action: { not: 'custom' } } },
    });
    expect(prismaMock.rolePermission.createMany).toHaveBeenCalledExactlyOnceWith({
      data: [
        { roleId: 'role-admin', permissionId: 'perm-orders-view' },
        { roleId: 'role-admin', permissionId: 'perm-customers-view' },
      ],
      skipDuplicates: true,
    });
  });

  /**
   * Regression for the real bug: `vendor-portal.*`-granted Member accounts suddenly failing
   * every `/vendors/me/*` self-service request with "Missing permission vendors:custom" after a
   * reseed. `vendors:custom` is a separate "special operation" plumbing gate (the vendor
   * self-service switch), not a matrix-governed V/C/E/D grant — it happens to share the `vendors`
   * menuKey with the matrix's "Members" admin-wide resource row, so a delete scoped by menuKey
   * alone wiped it out even though no `PERMISSION_MATRIX_GRANTS` entry ever listed it. The delete
   * must exclude the `custom` action regardless of menuKey, so a grant made by an earlier,
   * non-matrix step (e.g. `grantStarterPermissions`'s `resetGrant('vendor', [...])`) survives.
   */
  it('never deletes a `custom`-action grant even when its menuKey is governed (vendors:custom survives)', async () => {
    const roleIdByKey = new Map([['vendor', { id: 'role-vendor' }]]);
    const permIds = new Map([['vendor-portal.profile:view', 'perm-profile-view']]);
    await applyPermissionMatrix(
      prismaMock as never,
      roleIdByKey,
      permIds,
      { vendor: ['vendor-portal.profile:view'] },
      ['vendors', 'vendor-portal.profile'],
    );

    expect(prismaMock.rolePermission.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        roleId: 'role-vendor',
        permission: { menuKey: { in: ['vendors', 'vendor-portal.profile'] }, action: { not: 'custom' } },
      },
    });
  });

  it('skips a role named in the grants map that does not exist in `roles` (not yet created here), without crashing', async () => {
    await applyPermissionMatrix(
      prismaMock as never,
      roles,
      permissionIdByKey,
      { support: ['orders:view'] }, // not in `roles` map above
      governedMenuKeys,
    );

    expect(prismaMock.rolePermission.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.rolePermission.createMany).not.toHaveBeenCalled();
  });

  it('clears a role\'s governed grants down to nothing when its matrix row is an empty list', async () => {
    await applyPermissionMatrix(prismaMock as never, roles, permissionIdByKey, { marketing: [] }, governedMenuKeys);

    expect(prismaMock.rolePermission.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { roleId: 'role-marketing', permission: { menuKey: { in: governedMenuKeys }, action: { not: 'custom' } } },
    });
    expect(prismaMock.rolePermission.createMany).not.toHaveBeenCalled();
  });

  it('silently drops a permission key with no matching id, rather than crashing', async () => {
    await applyPermissionMatrix(
      prismaMock as never,
      roles,
      permissionIdByKey,
      { admin: ['orders:view', 'orders:create'] }, // 'orders:create' has no entry in permissionIdByKey
      governedMenuKeys,
    );

    expect(prismaMock.rolePermission.createMany).toHaveBeenCalledExactlyOnceWith({
      data: [{ roleId: 'role-admin', permissionId: 'perm-orders-view' }],
      skipDuplicates: true,
    });
  });
});
