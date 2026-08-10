import { describe, it, expect } from 'vitest';
import type { MenuNode } from '../../shared-types/src';
import { permissionKeyFor, can, filterMenuByPermissions } from './index';

describe('permissionKeyFor', () => {
  it('joins menuKey and action with a colon', () => {
    expect(permissionKeyFor('rbac.roles', 'view')).toBe('rbac.roles:view');
  });

  it('supports non-view actions', () => {
    expect(permissionKeyFor('rbac.users', 'delete')).toBe('rbac.users:delete');
  });

  // Edge cases
  it('handles an empty menuKey', () => {
    expect(permissionKeyFor('', 'view')).toBe(':view');
  });

  it('handles menu keys with nested dot notation', () => {
    expect(permissionKeyFor('masters.categories', 'edit')).toBe('masters.categories:edit');
  });
});

describe('can', () => {
  const granted = ['dashboard:view', 'rbac.roles:view', 'rbac.roles:edit'];

  it('returns true when the exact key is granted', () => {
    expect(can(granted, 'rbac.roles', 'edit')).toBe(true);
  });

  it('returns false when the key is not granted', () => {
    expect(can(granted, 'rbac.roles', 'delete')).toBe(false);
  });

  it('defaults action to "view" when omitted', () => {
    expect(can(granted, 'dashboard')).toBe(true);
  });

  it('defaults action to "view" and returns false when view is not granted', () => {
    expect(can(granted, 'rbac.users')).toBe(false);
  });

  // Edge cases
  it('returns false for an empty grantedPermissions list', () => {
    expect(can([], 'dashboard', 'view')).toBe(false);
  });

  it('returns false for a menuKey that does not exist at all', () => {
    expect(can(granted, 'nonexistent.module', 'view')).toBe(false);
  });
});

describe('filterMenuByPermissions', () => {
  const menu: MenuNode[] = [
    {
      id: 'dashboard',
      title: 'Dashboard',
      icon: 'dashboard',
      route: '/dashboard',
      permissionKey: 'dashboard',
      parent: null,
      order: 1,
    },
    {
      id: 'customers',
      title: 'Customers',
      icon: 'group',
      route: '/customers',
      permissionKey: 'customers',
      parent: null,
      order: 2,
    },
    {
      id: 'administration',
      title: 'Administration',
      icon: 'admin_panel_settings',
      permissionKey: 'administration',
      parent: null,
      order: 3,
      children: [
        {
          id: 'admin-roles',
          title: 'Role Management',
          icon: 'shield_person',
          route: '/administration/roles',
          permissionKey: 'rbac.roles',
          parent: 'administration',
          order: 1,
        },
        {
          id: 'admin-users',
          title: 'User Management',
          icon: 'manage_accounts',
          route: '/administration/users',
          permissionKey: 'rbac.users',
          parent: 'administration',
          order: 2,
        },
      ],
    },
    {
      id: 'masters',
      title: 'Masters',
      icon: 'category',
      permissionKey: 'masters',
      parent: null,
      order: 4,
      children: [
        {
          id: 'masters-categories',
          title: 'Categories',
          icon: 'category',
          route: '/masters/categories',
          permissionKey: 'masters.categories',
          parent: 'masters',
          order: 1,
        },
      ],
    },
  ];

  it('keeps a leaf node whose permissionKey is granted view', () => {
    const result = filterMenuByPermissions(menu, ['dashboard:view']);
    expect(result.map((n) => n.id)).toEqual(['dashboard']);
  });

  it('hides a leaf node whose permissionKey is not granted', () => {
    const result = filterMenuByPermissions(menu, ['dashboard:view']);
    expect(result.find((n) => n.id === 'customers')).toBeUndefined();
  });

  it('keeps a parent whose own permissionKey is not granted but a child is granted (parent survives via child)', () => {
    const result = filterMenuByPermissions(menu, ['rbac.roles:view']);
    const admin = result.find((n) => n.id === 'administration');
    expect(admin).toBeDefined();
    expect(admin?.children?.map((c) => c.id)).toEqual(['admin-roles']);
  });

  it('hides a parent entirely when neither it nor any child is granted', () => {
    const result = filterMenuByPermissions(menu, ['dashboard:view']);
    expect(result.find((n) => n.id === 'administration')).toBeUndefined();
    expect(result.find((n) => n.id === 'masters')).toBeUndefined();
  });

  it('preserves ordering by the "order" field after filtering', () => {
    const result = filterMenuByPermissions(menu, [
      'dashboard:view',
      'customers:view',
      'rbac.roles:view',
      'rbac.users:view',
    ]);
    expect(result.map((n) => n.id)).toEqual(['dashboard', 'customers', 'administration']);
    expect(result.find((n) => n.id === 'administration')?.children?.map((c) => c.id)).toEqual([
      'admin-roles',
      'admin-users',
    ]);
  });

  // Edge cases
  it('returns an empty array when no permissions are granted', () => {
    expect(filterMenuByPermissions(menu, [])).toEqual([]);
  });

  it('returns all top-level+children nodes when every permission is granted', () => {
    const allKeys = [
      'dashboard:view',
      'customers:view',
      'administration:view',
      'rbac.roles:view',
      'rbac.users:view',
      'masters:view',
      'masters.categories:view',
    ];
    const result = filterMenuByPermissions(menu, allKeys);
    expect(result.map((n) => n.id)).toEqual(['dashboard', 'customers', 'administration', 'masters']);
  });

  it('keeps a parent that is itself granted view even when it has no children array', () => {
    const flatMenu: MenuNode[] = [
      {
        id: 'settings',
        title: 'Settings',
        icon: 'settings',
        route: '/settings',
        permissionKey: 'settings',
        parent: null,
        order: 1,
      },
    ];
    expect(filterMenuByPermissions(flatMenu, ['settings:view']).map((n) => n.id)).toEqual(['settings']);
  });
});
