import { Router } from 'express';
import { validateBody } from '../middleware/validate';
import { VendorSelfCreateSchema } from '../schemas/vendor.schema';
import { vendorPublicRegisterRateLimiter } from '../middleware/rateLimiter';
import * as vendorService from '../services/vendor.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData } from '../lib/http';

/**
 * Genuinely public, unauthenticated Vendor self-registration ("Become a Vendor") — deliberately
 * its own router with NO `authenticate`, same "this is the one surface an anonymous caller is
 * meant to reach" discipline as `catalog.routes.ts`'s own doc comment. Input is the existing
 * `VendorSelfCreateSchema` — it has no `ownerUserId`/status/role/branch/category-access fields
 * at all, so there is nothing privileged for a public caller to smuggle in; that's a structural
 * guarantee (an unrecognized field is silently stripped by Zod, not merely validated away), not
 * a runtime filter that could be forgotten. `vendorService.registerPublicVendor` always creates a
 * brand-new owner User via the same `createVendorOwner` the admin "Add Vendor" flow uses —
 * rejecting outright if the submitted email/phone already belongs to anyone, never reusing or
 * merging into an existing account — then always creates the Vendor as `PENDING_VERIFICATION`
 * with `createdByUserId: null` — never ACTIVE, never self-approved; only the existing admin
 * `approve`/`reject` endpoints (`vendors.routes.ts`) can move it further.
 */
const router = Router();

router.post('/register', vendorPublicRegisterRateLimiter, validateBody(VendorSelfCreateSchema), async (req, res, next) => {
  try {
    const vendor = await vendorService.registerPublicVendor(req.body);
    await writeAuditLog({
      actorUserId: vendor.owner!.id,
      action: 'vendor.public_register',
      targetType: 'Vendor',
      targetId: vendor.id,
      after: vendor,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    sendData(res, vendor, { status: 201 });
  } catch (err) {
    next(err);
  }
});

export default router;
