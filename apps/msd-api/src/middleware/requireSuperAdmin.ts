import type { Request, Response, NextFunction } from 'express';
import { isSuperAdminRoleSet } from '../services/permission-resolver.service';
import { sendError } from '../lib/http';

/**
 * DELIBERATE, SPEC-MANDATED EXCEPTION to this codebase's normal "no role ever hardcoded, always
 * go through requirePermission()" rule (see CLAUDE.md / schema.prisma's `Role.isSuperAdmin` doc
 * comment). Member payout release (`POST /settlements/payouts`) is money actually leaving the
 * business — the approved plan requires it to stay Super-Admin-only on the server EVEN IF some
 * other role (e.g. `admin`) is ever granted the `accounts.member-settlements:approve` permission
 * through the Role Permission Matrix UI. This middleware is stacked AFTER
 * `requirePermission('accounts.member-settlements', 'approve')` on that one route only — it is
 * never a substitute for the permission check (both must pass), and this is the only place in
 * either API that checks `isSuperAdmin` as an authorization gate rather than a permission-matrix
 * input. Resolves the flag the same way `permission-resolver.service.ts` does — live
 * `Role.isSuperAdmin` from the DB, never a role-key string compare.
 */
export function requireSuperAdmin() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      sendError(res, 'UNAUTHORIZED', 'Authentication required');
      return;
    }

    try {
      const isSuperAdmin = await isSuperAdminRoleSet(req.user.roles);
      if (!isSuperAdmin) {
        sendError(res, 'FORBIDDEN', 'Only a Super Admin may release a member payout');
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
