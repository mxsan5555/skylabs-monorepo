import { describe, it, expect } from 'vitest';
import type { MenuNode } from '@skylabs-monorepo/shared-types';
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

  /**
   * Mirrors the real shape of `packages/shared-menu/src/msd-menu.json`'s Vendor-isolation nodes
   * (Vendor/Business/Customers/Orders/Products) — regression coverage for the "vendor gets
   * near-Superadmin sidebar" bug: a `vendor` role must see only the "Business" group, never
   * "Vendor" (admin vendor list), the full "Customers" directory, or the top-level "Orders"/
   * "Products" oversight nodes.
   */
  const msdVendorIsolationMenu: MenuNode[] = [
    {
      id: 'vendors',
      title: 'Vendor',
      icon: 'storefront',
      permissionKey: 'vendors',
      parent: null,
      order: 3,
      children: [
        { id: 'vendor-list', title: 'Vendor List', route: '/account/vendors', permissionKey: 'vendors', parent: 'vendors', order: 1 },
      ],
    },
    {
      id: 'business',
      title: 'Business',
      icon: 'storefront',
      permissionKey: 'vendor-portal',
      parent: null,
      order: 3,
      children: [
        { id: 'business-profile', title: 'Business Profile', route: '/account/vendor-profile', permissionKey: 'vendor-portal', parent: 'business', order: 1 },
        { id: 'business-branch', title: 'Branch', route: '/account/vendor-branches-deals', permissionKey: 'vendor-portal', parent: 'business', order: 2 },
        { id: 'business-deal', title: 'Deal', route: '/account/vendor-deals', permissionKey: 'vendor-portal', parent: 'business', order: 3 },
        { id: 'business-product', title: 'Product', route: '/account/vendor-products', permissionKey: 'vendor-portal', parent: 'business', order: 4 },
        { id: 'business-therapist', title: 'Therapist', route: '/account/vendor-therapists', permissionKey: 'vendor-portal', parent: 'business', order: 5 },
        { id: 'business-customer', title: 'Customer', route: '/account/vendor-customers', permissionKey: 'vendor-portal', parent: 'business', order: 6 },
        { id: 'business-order', title: 'Order', route: '/account/vendor-orders', permissionKey: 'vendor-portal', parent: 'business', order: 7 },
      ],
    },
    {
      id: 'customers',
      title: 'Customers',
      icon: 'group',
      permissionKey: 'customers',
      parent: null,
      order: 4,
      children: [
        { id: 'customer-list', title: 'Customer List', route: '/account/customers', permissionKey: 'customers', parent: 'customers', order: 1 },
      ],
    },
    { id: 'orders', title: 'Orders', route: '/account/orders', permissionKey: 'orders', parent: null, order: 4 },
    { id: 'products', title: 'Products', route: '/account/products', permissionKey: 'products', parent: null, order: 4 },
    { id: 'rbac.users', title: 'User', route: '/account/administration/users', permissionKey: 'rbac.users', parent: null, order: 2 },
  ];

  it("a vendor's granted set (dashboard:view, vendors:custom, vendor-portal:view) sees ONLY the Business group with all 7 self-service items", () => {
    const granted = ['dashboard:view', 'vendors:custom', 'vendor-portal:view'];
    const result = filterMenuByPermissions(msdVendorIsolationMenu, granted);
    expect(result.map((n) => n.id)).toEqual(['business']);
    expect(result[0].children?.map((c) => c.id)).toEqual([
      'business-profile',
      'business-branch',
      'business-deal',
      'business-product',
      'business-therapist',
      'business-customer',
      'business-order',
    ]);
  });

  it("a vendor never sees Vendor List, the Customers directory, User Management, or the admin Orders/Products nodes", () => {
    const granted = ['dashboard:view', 'vendors:custom', 'vendor-portal:view'];
    const result = filterMenuByPermissions(msdVendorIsolationMenu, granted);
    expect(result.find((n) => n.id === 'vendors')).toBeUndefined();
    expect(result.find((n) => n.id === 'customers')).toBeUndefined();
    expect(result.find((n) => n.id === 'orders')).toBeUndefined();
    expect(result.find((n) => n.id === 'products')).toBeUndefined();
    expect(result.find((n) => n.id === 'rbac.users')).toBeUndefined();
  });

  it("an admin's granted set sees Vendor/Customers/Orders/Products/User Management but never the vendor-only Business group", () => {
    const granted = ['vendors:view', 'customers:view', 'orders:view', 'products:view', 'rbac.users:view'];
    const result = filterMenuByPermissions(msdVendorIsolationMenu, granted);
    expect(result.map((n) => n.id).sort()).toEqual(['customers', 'orders', 'products', 'rbac.users', 'vendors']);
    expect(result.find((n) => n.id === 'business')).toBeUndefined();
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
