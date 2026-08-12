import type { NextFunction, Request, Response } from 'express';
import type { PermissionAction } from '@skylabs-monorepo/shared-types';
import { can } from '@skylabs-monorepo/shared-permissions';
import { resolvePermissionsForRoles } from '../services/permission.service';

/**
 * The ONLY gate protected routes use. It never compares a role name — it resolves the
 * caller's roles to a flat permission-key set from the DB (Role -> RolePermission ->
 * Permission) and checks `${menuKey}:${action}` against it via `can()` from
 * `@skylabs-monorepo/shared-permissions`.
 *
 * Usage: `router.get('/', authenticate, requirePermission('drivers', 'view'), handler)`
 */
export function requirePermission(menuKey: string, action: PermissionAction = 'view') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Missing bearer token' } });
      return;
    }

    try {
      const granted = await resolvePermissionsForRoles(req.user.roles);
      if (!can(granted, menuKey, action)) {
        res.status(403).json({
          data: null,
          error: {
            code: 'FORBIDDEN',
            message: `Missing permission ${menuKey}:${action}`,
          },
        });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
