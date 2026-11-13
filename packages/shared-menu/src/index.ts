import type { AppId, MenuNode } from '@skylabs-monorepo/shared-types';
import type { PermissionAction } from '@skylabs-monorepo/shared-types';

import msdMenu from './msd-menu.json';
import meraDriverMenu from './mera-driver-menu.json';

/**
 * Static menu structure per app.
 *
 * This is used ONLY for application navigation:
 * - sidebar
 * - routes
 * - breadcrumbs
 * - menu visibility
 *
 * RBAC permissions must NOT be generated from this menu.
 */
export function getMenuForApp(app: AppId): MenuNode[] {
  return (app === 'msd' ? msdMenu : meraDriverMenu) as MenuNode[];
}

/**
 * Fixed RBAC business resource catalog.
 *
 * IMPORTANT:
 * This catalog is independent from the application navigation menu.
 *
 * These are the ONLY resources/actions exposed by the new
 * business permission matrix.
 */
export interface RbacResourceDefinition {
  key: string;
  title: string;
  actions: PermissionAction[];
}

export const RBAC_RESOURCE_CATALOG: RbacResourceDefinition[] = [
  {
    key: 'members',
    title: 'Members',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'branches',
    title: 'Branches',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'deals',
    title: 'Deals',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'therapists',
    title: 'Therapists',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'products',
    title: 'Products',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'orders',
    title: 'Orders',
    actions: ['view'],
  },
  {
    key: 'customers',
    title: 'Customers',
    actions: ['view'],
  },
  {
    key: 'content',
    title: 'Content',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'payments_payouts',
    title: 'Payments & Payouts',
    actions: ['view'],
  },
  {
    key: 'reports',
    title: 'Reports',
    actions: ['view'],
  },
  {
    key: 'staff_users',
    title: 'Staff Users',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'system_settings',
    title: 'System Settings',
    actions: ['view', 'edit'],
  },
  {
    key: 'logs',
    title: 'Logs',
    actions: ['view'],
  },
  {
    key: 'my_profile',
    title: 'My Profile',
    actions: ['view', 'edit'],
  },
];

/**
 * Flattened lookup, e.g. for breadcrumbs.
 *
 * This continues to work with the actual application menu.
 */
export function findMenuNodeByRoute(
  menu: readonly MenuNode[],
  route: string,
): MenuNode | undefined {
  for (const node of menu) {
    if (node.route === route) {
      return node;
    }

    if (node.children) {
      const found = findMenuNodeByRoute(node.children, route);

      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

export { msdMenu, meraDriverMenu };