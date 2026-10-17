import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import { sendError } from '../lib/http';
import { prisma } from '../lib/prisma';
import { MEMBER_ROLE_KEYS } from '../lib/role-keys';
import { getMemberAccessState } from '../services/member-access.service';
import { inactiveReadOnlyMessage, suspendedMessage } from '../lib/member-messages';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// Real paths from routes/auth.routes.ts (mounted at /api/v1/auth). Refresh does not run
// authenticate today; it stays listed so a future change keeps it open.
const READ_ONLY_EXEMPT_SUFFIXES = ['/auth/logout', '/auth/logout-all', '/auth/refresh'];

/** An inactive member may read, and may always log out or refresh a token. */
export function isReadOnlyExempt(method: string, originalUrl: string): boolean {
  if (READ_METHODS.has(method.toUpperCase())) return true;
  const path = originalUrl.split('?')[0].replace(/\/+$/, '');
  return READ_ONLY_EXEMPT_SUFFIXES.some((suffix) => path.endsWith(suffix));
}

/**
 * Verifies the Bearer JWT, re-checks the current `User.status` from the database, and attaches
 * `req.user`. Does not check permissions — see requirePermission.ts.
 *
 * The status re-check exists here — the one shared choke point — rather than duplicated per
 * route: `router.use(authenticate)` is applied identically across every authenticated route
 * file in this API (customer, vendor, and staff/admin routes alike — verified across all
 * authenticated route files before adding this; `catalog.routes.ts` and
 * `vendor-public.routes.ts` are the only genuinely public surfaces and never reach this
 * middleware at all). Without this, an already-issued access token would keep working exactly
 * as before even after the account is deactivated/suspended, until the token's own short
 * natural expiry — this closes that gap. Deliberate consequence: a suspended/inactive STAFF or
 * VENDOR account is locked out immediately too, not just customers — there is one unified
 * `User.status`, and this is the only architecturally consistent choke point for enforcing it
 * without duplicating the check into every route file individually. One extra indexed
 * primary-key read per authenticated request.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

  if (!token) {
    sendError(res, 'UNAUTHORIZED', 'Missing bearer token');
    return;
  }

  try {
    req.user = verifyAccessToken(token);
  } catch {
    sendError(res, 'UNAUTHORIZED', 'Invalid or expired token');
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub }, select: { status: true, deletedAt: true } });
    if (!user || user.deletedAt || user.status !== 'active') {
      sendError(res, 'FORBIDDEN', 'This account has been disabled. Please contact support.');
      return;
    }

    // Token roles decide whether to look up a member, so staff and customers pay no extra read.
    // A suspended or archived member loses an already-issued token; an inactive one reads only.
    if ((req.user.roles ?? []).some((role) => MEMBER_ROLE_KEYS.includes(role))) {
      const access = await getMemberAccessState(req.user.sub);
      if (access.kind === 'blocked') {
        sendError(res, 'MEMBER_SUSPENDED', suspendedMessage(access.reason));
        return;
      }
      if (access.kind === 'readOnly' && !isReadOnlyExempt(req.method, req.originalUrl)) {
        sendError(res, 'MEMBER_INACTIVE_READ_ONLY', inactiveReadOnlyMessage());
        return;
      }
    }
  } catch (err) {
    next(err);
    return;
  }

  next();
}
