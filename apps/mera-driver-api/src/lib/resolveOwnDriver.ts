import type { NextFunction, Request, Response } from 'express';
import { prisma } from './prisma';

/**
 * The ONLY place a caller's own `driverId` is ever resolved — always from `req.user.sub`
 * (the authenticated JWT subject), never from a route param, query string, or request body.
 * Every `/drivers/me*` route uses this instead of `requirePermission`: ownership of a linked
 * Driver record *is* the authorization here, not a role/permission grant (a driver has no
 * `drivers:*` permission and must never be given one just to use their own portal).
 *
 * 404s with `DRIVER_NOT_LINKED` (not a generic 404) if the caller's User has no linked
 * Driver yet, so the frontend can show "ask your admin to link your account" rather than a
 * generic error.
 */
export async function resolveOwnDriver(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Missing bearer token' } });
    return;
  }

  try {
    const driver = await prisma.driver.findUnique({
      where: { userId: req.user.sub },
      select: { id: true, accountStatus: true },
    });
    if (!driver) {
      res.status(404).json({
        data: null,
        error: { code: 'DRIVER_NOT_LINKED', message: 'Your account is not linked to a driver record yet.' },
      });
      return;
    }
    // Deactivated drivers keep a valid (unexpired) JWT until it naturally expires — this is
    // the per-request re-check that revokes their portal access immediately rather than
    // waiting out the token's remaining lifetime. Same restriction enforced at login time
    // (`assertDriverAccountActive`) for the not-yet-authenticated case.
    if (driver.accountStatus === 'Inactive') {
      res.status(403).json({
        data: null,
        error: { code: 'DRIVER_DEACTIVATED', message: 'Your driver account has been deactivated. Please contact your administrator.' },
      });
      return;
    }
    req.driver = { id: driver.id };
    next();
  } catch (err) {
    next(err);
  }
}
