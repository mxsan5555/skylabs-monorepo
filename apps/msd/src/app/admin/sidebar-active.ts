import type { MenuNode } from '@skylabs-monorepo/shared-types';

/** Select the most specific leaf on a path boundary; overlapping destinations never select twice. */
export function activeMenuLeafId(nodes: MenuNode[], pathname: string): string | undefined {
  let match: { id: string; length: number } | undefined;
  const visit = (node: MenuNode) => {
    if (node.children?.length) {
      node.children.forEach(visit);
      return;
    }
    const route = node.route?.replace(/\/$/, '');
    if (route && (pathname === route || pathname.startsWith(`${route}/`)) && (!match || route.length > match.length)) {
      match = { id: node.id, length: route.length };
    }
  };
  nodes.forEach(visit);
  return match?.id;
}

export function containsMenuLeaf(node: MenuNode, id: string): boolean {
  return node.id === id || Boolean(node.children?.some((child) => containsMenuLeaf(child, id)));
}
