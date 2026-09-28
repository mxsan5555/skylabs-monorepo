import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPrismaMock } from '../test-utils/prisma-mock';
import { migrateSharedKeySplitGrants } from './permission-migration.service';

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
