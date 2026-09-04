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
