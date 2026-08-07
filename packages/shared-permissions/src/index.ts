import type { MenuNode, PermissionAction } from '@skylabs-monorepo/shared-types';

/** Canonical permission key format shared by both APIs' `Permission.key` column and the frontends. */
export function permissionKeyFor(menuKey: string, action: PermissionAction): string {
  return `${menuKey}:${action}`;
}

/** Pure check against a flat list of granted permission keys (as returned by `GET /rbac/bootstrap`). */
export function can(
  grantedPermissions: readonly string[],
  menuKey: string,
  action: PermissionAction = 'view',
): boolean {
  return grantedPermissions.includes(permissionKeyFor(menuKey, action));
}

/**
 * Prunes a static menu tree (from `@skylabs-monorepo/shared-menu`) down to the nodes the caller
 * may see: a node survives if it grants `${permissionKey}:view`, or if any of its children do
 * (so a parent group isn't hidden just because it has no route of its own).
 */
export function filterMenuByPermissions(
  menu: readonly MenuNode[],
  grantedPermissions: readonly string[],
): MenuNode[] {
  const result: MenuNode[] = [];
  for (const node of menu) {
    const children = node.children
      ? filterMenuByPermissions(node.children, grantedPermissions)
      : undefined;
    const visible = can(grantedPermissions, node.permissionKey, 'view');
    if (visible || (children && children.length > 0)) {
      result.push({ ...node, children });
    }
  }
  return result.sort((a, b) => a.order - b.order);
}
