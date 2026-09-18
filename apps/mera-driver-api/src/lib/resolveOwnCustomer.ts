import type { NextFunction, Request, Response } from 'express';
import { prisma } from './prisma';

/**
 * The ONLY place a caller's own `customerId` is ever resolved — always from `req.user.sub`
 * (the authenticated JWT subject), never from a route param, query string, or request body.
 * Every `/customers/me*` route uses this instead of `requirePermission`: ownership of a
 * linked Customer record *is* the authorization here, not a role/permission grant (a
 * customer has no `customers:*` permission and must never be given one just to use their
 * own portal). Mirrors `resolveOwnDriver` exactly.
 *
 * 404s with `CUSTOMER_NOT_LINKED` (not a generic 404) if the caller's User has no linked
 * Customer yet, so the frontend can show a clear message rather than a generic error.
 */
export async function resolveOwnCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Missing bearer token' } });
    return;
  }

  try {
    const customer = await prisma.customer.findUnique({
      where: { userId: req.user.sub },
      select: { id: true, accountStatus: true },
    });
    if (!customer) {
      res.status(404).json({
        data: null,
        error: { code: 'CUSTOMER_NOT_LINKED', message: 'Your account is not linked to a customer record yet.' },
      });
      return;
    }
    // Deactivated customers keep a valid (unexpired) JWT until it naturally expires — this
    // is the per-request re-check that revokes their portal access immediately rather than
    // waiting out the token's remaining lifetime. Same restriction enforced at login time
    // (`assertCustomerAccountActive`) for the not-yet-authenticated case. Mirrors the exact
    // Driver `accountStatus` enforcement pattern.
    if (customer.accountStatus === 'Inactive') {
      res.status(403).json({
        data: null,
        error: { code: 'CUSTOMER_DEACTIVATED', message: 'Your account has been deactivated. Please contact support.' },
      });
      return;
    }
    req.customer = { id: customer.id };
    next();
  } catch (err) {
    next(err);
  }
}
