import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { driverOwnerScope } from '../lib/ownerScope';

/**
 * After `requirePermission('drivers', ...)` passes, re-checks per-record ownership for the
 * non-full-queue creator roles (Vendor/Sales/Data Operator) so one of them can't read/edit
 * another's driver by guessing/enumerating ids — list-level filtering alone isn't enough
 * since every single-record route (`/:id/details`, `/:id/pill-review`, `PATCH /:id`, …) is
 * reached directly by id. 404s (not 403) on a mismatch, consistent with the existing KYC
 * `/drivers/assigned-to-me/:id` pattern — existence of another owner's record is never
 * revealed either way.
 */
export async function requireDriverOwnership(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerUserId = await driverOwnerScope(req);
    if (!ownerUserId) { next(); return; }
    const driver = await prisma.driver.findUnique({ where: { id: req.params.id }, select: { createdByUserId: true } });
    if (!driver || driver.createdByUserId !== ownerUserId) {
      res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Driver not found' } });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
