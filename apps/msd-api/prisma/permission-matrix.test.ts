import { describe, it, expect } from 'vitest';
import { getMenuForApp } from '@skylabs-monorepo/shared-menu';
import { filterMenuByPermissions } from '@skylabs-monorepo/shared-permissions';
import { PERMISSION_MATRIX_GRANTS } from './permission-matrix';

describe('permission-matrix: governed roles', () => {
  it('governs exactly admin/marketing/sales/support/member — never the retired `vendor` key', () => {
    expect(Object.keys(PERMISSION_MATRIX_GRANTS).sort()).toEqual(
      ['admin', 'marketing', 'sales', 'member', 'support'].sort(),
    );
  });
});

describe('permission-matrix: member row (own-business-only)', () => {
  it('grants the vendor-portal.* self-service surface, never the admin-wide keys', () => {
    for (const key of PERMISSION_MATRIX_GRANTS.member) {
      const menuKey = key.slice(0, key.lastIndexOf(':'));
      expect(['vendor-portal.profile', 'vendor-portal.branches', 'vendor-portal.deals', 'vendor-portal.therapists', 'vendor-portal.products', 'vendor-portal.customers', 'vendor-portal.orders', 'vendor-portal.payments', 'vendor-portal.reports', 'settings']).toContain(menuKey);
    }
  });

  it('grants vendor-portal.customers:view (PLANNING.md §1.2 D19: "V O, customers who ordered from them")', () => {
    expect(PERMISSION_MATRIX_GRANTS.member).toContain('vendor-portal.customers:view');
  });

  it('never grants delete on vendor-portal.products (members never delete, PLANNING.md §1.3 rule 1)', () => {
    expect(PERMISSION_MATRIX_GRANTS.member).not.toContain('vendor-portal.products:delete');
  });
});

/**
 * Regression coverage for "Marketing/Sales/Support see an identical sidebar" (investigated
 * 2026-10-26). Root cause: `filterMenuByPermissions` (correctly) gates sidebar NODE visibility
 * on `:view` alone, and PLANNING.md §1.2's matrix legitimately gives Sales and Support the exact
 * same `:view` cells on Members/Branches/Deals/Therapists/Products/Orders/Customers — they only
 * differ in Create/Edit/Delete, which never changes which nodes exist, only what buttons appear
 * once inside one. That's by design, not a resolver/bootstrap bug. Marketing differs from both
 * because the matrix denies it Orders/Customers outright (`-` cells). Real differentiation that
 * WAS broken (coarse `members:edit`/`members:delete` substituted for each catalog resource's own
 * key on `member-detail-page.tsx`) is covered separately in that component's own test file.
 */
describe('permission-matrix: Marketing vs Sales vs Support sidebar-node visibility (PLANNING.md §1.2)', () => {
  const resourceMenu = [
    { id: 'vendors', title: 'Members', icon: 'storefront', permissionKey: 'vendors', parent: null, order: 1 },
    { id: 'customers', title: 'Customers', icon: 'group', permissionKey: 'customers', parent: null, order: 2 },
    { id: 'orders', title: 'Orders', icon: 'shopping_cart', permissionKey: 'orders', parent: null, order: 3 },
    { id: 'cms', title: 'CMS', icon: 'article', permissionKey: 'cms', parent: null, order: 4 },
  ];

  it("Marketing's menu excludes Customers and Orders — the matrix denies it both (`-` cells)", () => {
    const visible = filterMenuByPermissions(resourceMenu, PERMISSION_MATRIX_GRANTS.marketing).map((n) => n.id);
    expect(visible).toContain('vendors');
    expect(visible).toContain('cms');
    expect(visible).not.toContain('customers');
    expect(visible).not.toContain('orders');
  });

  it('Sales and Support see the same resource nodes (both hold View on every one) — intentional, not a bug', () => {
    const salesVisible = filterMenuByPermissions(resourceMenu, PERMISSION_MATRIX_GRANTS.sales).map((n) => n.id).sort();
    const supportVisible = filterMenuByPermissions(resourceMenu, PERMISSION_MATRIX_GRANTS.support).map((n) => n.id).sort();
    expect(salesVisible).toEqual(['cms', 'customers', 'orders', 'vendors']);
    expect(supportVisible).toEqual(salesVisible);
  });

  it('Sales and Support nonetheless hold different actions on the same resource — Sales can create/edit, Support cannot', () => {
    expect(PERMISSION_MATRIX_GRANTS.sales).toContain('vendors.branches:create');
    expect(PERMISSION_MATRIX_GRANTS.sales).toContain('vendors.branches:edit');
    expect(PERMISSION_MATRIX_GRANTS.support).not.toContain('vendors.branches:create');
    expect(PERMISSION_MATRIX_GRANTS.support).not.toContain('vendors.branches:edit');
  });
});

/**
 * Regression coverage for 2026-10-26's Admin cell fixes against PLANNING.md §1.2's Extra
 * Actions table and §1.3 rule 3 — all four were confirmed missing or in excess before this fix,
 * none of them blocked by a route guard that would have caught it (the grant simply never
 * existed, or existed when it should not have).
 */
describe('permission-matrix: Admin extra actions (PLANNING.md §1.2 Extra Actions table, §1.3 rule 3)', () => {
  it('holds orders:status_change ("Order cancel | Super Admin, Admin")', () => {
    expect(PERMISSION_MATRIX_GRANTS.admin).toContain('orders:status_change');
  });

  it('holds customers:status_change ("Customer block/unblock | Super Admin, Admin")', () => {
    expect(PERMISSION_MATRIX_GRANTS.admin).toContain('customers:status_change');
  });

  it('holds reports:export ("Report export | Super Admin, Admin")', () => {
    expect(PERMISSION_MATRIX_GRANTS.admin).toContain('reports:export');
  });

  it('never holds system-settings:edit — §1.3 rule 3 lists it as super-admin-only, and the matrix row is `V A`, not `VE A`', () => {
    expect(PERMISSION_MATRIX_GRANTS.admin).toContain('system-settings:view');
    expect(PERMISSION_MATRIX_GRANTS.admin).not.toContain('system-settings:edit');
  });

  it('Sales keeps none of these ("Sales gets no status change, approve, reject, export or delete")', () => {
    expect(PERMISSION_MATRIX_GRANTS.sales).not.toContain('orders:status_change');
    expect(PERMISSION_MATRIX_GRANTS.sales).not.toContain('customers:status_change');
    expect(PERMISSION_MATRIX_GRANTS.sales).not.toContain('reports:export');
  });
});

describe('permission-matrix: real msd-menu.json sidebar, Admin vs Marketing', () => {
  it("Marketing's resolved sidebar never includes the Admin/RBAC group (no rbac.* grant in the matrix)", () => {
    const visible = filterMenuByPermissions(getMenuForApp('msd'), PERMISSION_MATRIX_GRANTS.marketing);
    expect(visible.find((n) => n.id === 'admin')).toBeUndefined();
  });

  it("Admin's resolved sidebar includes the CMS group, matching its matrix grant", () => {
    const visible = filterMenuByPermissions(getMenuForApp('msd'), PERMISSION_MATRIX_GRANTS.admin);
    expect(visible.find((n) => n.id === 'cms')).toBeDefined();
  });
});
