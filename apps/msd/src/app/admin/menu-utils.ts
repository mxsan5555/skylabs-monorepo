import type { MenuNode } from '@skylabs-monorepo/shared-types';

/** Flattens the (already permission-filtered) menu tree to find the node matching the current route, for the breadcrumb. */
export function findMenuNodeByRoute(menu: MenuNode[], pathname: string): MenuNode | undefined {
  for (const node of menu) {
   
    if (node.route === pathname) return node;
    if (node.children) {
      const found = findMenuNodeByRoute(node.children, pathname);
      if (found) return found;
    }
  }
  return undefined;
}

/** True when any route under `node` (at any depth) is the current page or one of its sub-pages. */
export function menuContainsRoute(node: MenuNode, pathname: string): boolean {
  return Boolean(
    (node.route && pathname.startsWith(node.route)) ||
      node.children?.some((child) => menuContainsRoute(child, pathname)),
  );
}
