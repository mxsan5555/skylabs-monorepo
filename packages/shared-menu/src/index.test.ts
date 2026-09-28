import { describe, it, expect } from 'vitest';
import { getMenuForApp, findMenuNodeByRoute, msdMenu, meraDriverMenu } from './index';

describe('getMenuForApp', () => {
  it('returns the msd menu tree for "msd"', () => {
    expect(getMenuForApp('msd')).toEqual(msdMenu);
  });

  it('returns the mera-driver menu tree for "mera-driver"', () => {
    expect(getMenuForApp('mera-driver')).toEqual(meraDriverMenu);
  });

  it('returns different trees for the two apps', () => {
    const msd = getMenuForApp('msd');
    const meraDriver = getMenuForApp('mera-driver');
    expect(msd).not.toEqual(meraDriver);
    expect(msd.map((n) => n.id)).not.toEqual(meraDriver.map((n) => n.id));
  });

  it('both app menus share the common "administration" RBAC subtree shape', () => {
    const msdAdmin = getMenuForApp('msd').find((n) => n.id === 'administration');
    const meraAdmin = getMenuForApp('mera-driver').find((n) => n.id === 'administration');
    expect(msdAdmin?.children?.map((c) => c.id)).toEqual(['admin-roles', 'admin-users', 'admin-audit-logs']);
    expect(meraAdmin?.children?.map((c) => c.id)).toEqual(['admin-roles', 'admin-users', 'admin-audit-logs']);
  });
});

describe('findMenuNodeByRoute', () => {
  const menu = getMenuForApp('msd');

  it('finds a top-level node by its route', () => {
    const node = findMenuNodeByRoute(menu, '/dashboard');
    expect(node?.id).toBe('dashboard');
  });

  it('finds a nested child node by its route', () => {
    const node = findMenuNodeByRoute(menu, '/administration/roles');
    expect(node?.id).toBe('admin-roles');
  });

  it('finds a deeply-nested child under a different parent group', () => {
    const node = findMenuNodeByRoute(menu, '/masters/tags');
    expect(node?.id).toBe('masters-tags');
  });

  // Edge cases
  it('returns undefined for an unknown route', () => {
    expect(findMenuNodeByRoute(menu, '/does-not-exist')).toBeUndefined();
  });

  it('returns undefined for an empty menu list', () => {
    expect(findMenuNodeByRoute([], '/dashboard')).toBeUndefined();
  });

  it('returns undefined for a route that belongs only to the other app', () => {
    const meraMenu = getMenuForApp('mera-driver');
    expect(findMenuNodeByRoute(meraMenu, '/customers')).toBeUndefined();
  });
});

describe('msd menu permissionKey independence (regression for the Role Permission Matrix bug)', () => {
  // A shared `permissionKey` across distinct menu nodes means they resolve to the SAME
  // `Permission.id` (Permission.key === `${menuKey}:${action}`), so checking one node's box in
  // the Role Permission Matrix silently checks every node sharing that key too. The admin
  // "Vendor" group and the vendor's own "Business" group both used to collapse their five/seven
  // children onto one shared key ("vendors" / "vendor-portal") — this pins each child to its own
  // distinct key so that regression can't silently come back.
  const msdMenu = getMenuForApp('msd');

  it('gives each child of the admin "Vendor" group its own distinct permissionKey', () => {
    const vendors = msdMenu.find((n) => n.id === 'vendors');
    const keys = vendors?.children?.map((c) => c.permissionKey) ?? [];
    expect(keys).toEqual(['vendors', 'vendors.branches', 'vendors.deals', 'vendors.products', 'vendors.therapists']);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives each of the vendor-portal "Business" surface nodes its own distinct permissionKey', () => {
    const businessNodeIds = [
      'business-profile',
      'business-branch',
      'business-deal',
      'business-product',
      'business-therapist',
      'business-customer',
      'business-order',
    ];
    const keys = businessNodeIds.map((id) => msdMenu.find((n) => n.id === id)?.permissionKey);
    expect(keys).toEqual([
      'vendor-portal.profile',
      'vendor-portal.branches',
      'vendor-portal.deals',
      'vendor-portal.products',
      'vendor-portal.therapists',
      'vendor-portal.customers',
      'vendor-portal.orders',
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // General regression guard, not just the two groups above — a decorative parent group header
  // (e.g. "Admin", "Manage", "Vendor", "Business", "Customers", "Static", "Analytics",
  // "Settings") must never reuse a real child's permissionKey, or the group's own Role
  // Permission Matrix row becomes the same checkbox as that child's row. `cms-blog-pages` and
  // `cms-blog-articles` used to be the one documented exception (deliberately sharing `cms.blog`)
  // — now split into their own `cms.blog.pages`/`cms.blog.articles` keys too (see seed.ts's
  // migrateSharedKeySplitGrants for how existing roles' access was preserved across that split),
  // so every node in the tree now has a fully unique permissionKey with no exceptions.
  it('every node in the msd menu has a unique permissionKey', () => {
    function flatten(nodes: readonly import('@skylabs-monorepo/shared-types').MenuNode[], out: { id: string; permissionKey: string }[] = []) {
      for (const n of nodes) {
        out.push({ id: n.id, permissionKey: n.permissionKey });
        if (n.children) flatten(n.children, out);
      }
      return out;
    }
    const byKey = new Map<string, string[]>();
    for (const { id, permissionKey } of flatten(msdMenu)) {
      byKey.set(permissionKey, [...(byKey.get(permissionKey) ?? []), id]);
    }
    const duplicates = [...byKey.entries()].filter(([, ids]) => ids.length > 1);
    expect(duplicates).toEqual([]);
  });
});
