import type { Request, Response, NextFunction } from 'express';
import type { PermissionAction } from '@skylabs-monorepo/shared-types';
import { can } from '@skylabs-monorepo/shared-permissions';
import { resolveGrantedPermissionKeys } from '../services/permission-resolver.service';
import { sendError } from '../lib/http';

/**
 * The generic permission gate. Every protected route calls this — never a hardcoded
 * role-name check. Permissions are resolved dynamically per-request (via a short-TTL
 * cache) from UserRole → RolePermission → Permission, so granting/revoking a permission
 * to a role takes effect for every route that guards on it without touching route code.
 */
export function requirePermission(menuKey: string, action: PermissionAction = 'view') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      sendError(res, 'UNAUTHORIZED', 'Authentication required');
      return;
    }

    try {
      const granted = await resolveGrantedPermissionKeys(req.user.roles);
      if (!can(granted, menuKey, action)) {
        sendError(res, 'FORBIDDEN', `Missing permission ${menuKey}:${action}`);
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
