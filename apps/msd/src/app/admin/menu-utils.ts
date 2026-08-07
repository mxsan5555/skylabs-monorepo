import type { MenuNode } from '@skylabs-monorepo/shared-types';

/** Flattens the (already permission-filtered) menu tree to find the node matching the current route, for the breadcrumb. */
export function findMenuNodeByRoute(menu: MenuNode[], pathname: string): MenuNode | undefined {
  for (const node of menu) {
    console.log('findMenuNodeByRoute', node.route, pathname);
    if (node.route === pathname) return node;
    if (node.children) {
      const found = findMenuNodeByRoute(node.children, pathname);
      if (found) return found;
    }
  }
  return undefined;
}
