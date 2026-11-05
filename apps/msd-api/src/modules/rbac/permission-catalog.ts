import type { PermissionAction } from '@skylabs-monorepo/shared-types';

/**
 * One row of the Role Permission Matrix screen (PLANNING.md §1.2's 14 resources). Unlike the
 * old version of this file, every `menuKeys` entry is a REAL key `requirePermission()` and
 * `filterMenuByPermissions` actually read — the same nested `shared-menu` key space
 * `permission-matrix.ts`/`seed.ts` already govern for the 5 non-SuperAdmin roles. A resource
 * with more than one key (only `content` today) aggregates every real key that
 * `permission-matrix.ts`'s `CONTENT_GROUP` already grants together — toggling this row's
 * View/Create/Edit/Delete toggles all of them atomically, so a saved change here is the exact
 * same change the seed already makes, not a parallel key space nothing reads (found 2026-10-27,
 * see ARCHITECTURE.md §1 and TASKS.md P10-08 for the full root-cause writeup).
 */
export interface RbacResourceDefinition {
  /** Stable row id — not necessarily a real permission key itself (see `content`). */
  key: string;
  /** Every real governing `Permission.menuKey` this row controls. */
  menuKeys: string[];
  title: string;
  actions: PermissionAction[];
  /** `menuKeys` entries that don't support a given action at all — e.g. the 3 singleton CMS
   *  pages (About Us, Contact Us, Website Pages) have no create/delete concept, matching
   *  `permission-matrix.ts`'s `CONTENT_SINGLETON_KEYS`. Omitted keys support every action in
   *  `actions`. */
  unsupportedFor?: Partial<Record<PermissionAction, readonly string[]>>;
}

/** Mirrors `permission-matrix.ts`'s `CONTENT_GROUP`/`CONTENT_SINGLETON_KEYS` exactly — the
 *  real `cms`/`cms.*` keys every role's Content grant already covers together. */
const CONTENT_MENU_KEYS = [
  'cms',
  'cms.blog.pages',
  'cms.blog.articles',
  'cms.blog-category',
  'cms.about-us',
  'cms.contact-us',
  'cms.faq',
  'cms.how-it-works',
  'cms.careers',
  'cms.social-media',
  'cms.website-pages',
];
const CONTENT_SINGLETON_MENU_KEYS = ['cms.about-us', 'cms.contact-us', 'cms.website-pages'];

export const RBAC_RESOURCE_CATALOG: RbacResourceDefinition[] = [
  { key: 'members', menuKeys: ['members'], title: 'Members', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'branches', menuKeys: ['vendors.branches'], title: 'Branches', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'deals', menuKeys: ['vendors.deals'], title: 'Deals', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'therapists', menuKeys: ['vendors.therapists'], title: 'Therapists', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'products', menuKeys: ['vendors.products'], title: 'Products', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'orders', menuKeys: ['orders'], title: 'Orders', actions: ['view'] },
  { key: 'customers', menuKeys: ['customers'], title: 'Customers', actions: ['view'] },
  {
    key: 'content',
    menuKeys: CONTENT_MENU_KEYS,
    title: 'Content',
    actions: ['view', 'create', 'edit', 'delete'],
    unsupportedFor: {
      create: CONTENT_SINGLETON_MENU_KEYS,
      delete: CONTENT_SINGLETON_MENU_KEYS,
    },
  },
  { key: 'payments', menuKeys: ['payments'], title: 'Payments & Payouts', actions: ['view'] },
  { key: 'reports', menuKeys: ['reports'], title: 'Reports', actions: ['view'] },
  { key: 'staff-users', menuKeys: ['rbac.users'], title: 'Staff Users', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'system-settings', menuKeys: ['system-settings'], title: 'System Settings', actions: ['view', 'edit'] },
  { key: 'audit-logs', menuKeys: ['rbac.audit-logs'], title: 'Logs', actions: ['view'] },
  { key: 'my-profile', menuKeys: ['settings'], title: 'My Profile', actions: ['view', 'edit'] },
];
