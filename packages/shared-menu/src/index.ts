import type { AppId, MenuNode } from '@skylabs-monorepo/shared-types';
import msdMenu from './msd-menu.json';
import meraDriverMenu from './mera-driver-menu.json';

/**
 * Static menu structure per app (id/title/icon/route/permissionKey/parent/children/order).
 * This file never changes at runtime — visibility is computed by pairing it with the
 * caller's granted permissions via `filterMenuByPermissions` from `@skylabs-monorepo/shared-permissions`.
 */
export function getMenuForApp(app: AppId): MenuNode[] {
  return (app === 'msd' ? msdMenu : meraDriverMenu) as MenuNode[];
}

/** Flattened lookup, e.g. for breadcrumbs — mirrors each app's old `findMenuItem`. */
export function findMenuNodeByRoute(menu: readonly MenuNode[], route: string): MenuNode | undefined {
  for (const node of menu) {
    if (node.route === route) return node;
    if (node.children) {
      const found = findMenuNodeByRoute(node.children, route);
      if (found) return found;
    }
  }
  return undefined;
}

export { msdMenu, meraDriverMenu };
