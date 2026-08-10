import { PERMISSION_ACTIONS, type MenuNode, type PermissionAction } from '@skylabs-monorepo/shared-types';

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

function flattenMenuNodes(menu: readonly MenuNode[]): MenuNode[] {
  const out: MenuNode[] = [];
  for (const node of menu) {
    out.push(node);
    if (node.children) out.push(...flattenMenuNodes(node.children));
  }
  return out;
}

/**
 * Every `${menuKey}:${action}` key derivable from a menu tree, across all fixed `PermissionAction`
 * kinds. This is the full "grant everything, including whatever gets added later" permission set —
 * for a role that must never lose access regardless of what's actually stored in `RolePermission`
 * (e.g. SuperAdmin). Since it walks the live menu tree instead of a hardcoded list, a newly added
 * sidebar/menu node is included automatically with no code change.
 */
export function allPermissionKeysForMenu(menu: readonly MenuNode[]): string[] {
  return flattenMenuNodes(menu).flatMap((node) =>
    PERMISSION_ACTIONS.map((action) => permissionKeyFor(node.permissionKey, action)),
  );
}
