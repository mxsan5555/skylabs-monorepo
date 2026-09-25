import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { resolveOwnCustomer } from '../lib/resolveOwnCustomer';
import { validateBody } from '../middleware/validate';
import * as auditService from '../services/audit.service';
import * as customerService from '../services/customer.service';
import { UpdateOwnCustomerSchema } from '../schemas/customerSelf.schema';
import { requestMeta } from '../lib/requestMeta';

/**
 * The customer self-service surface, mounted at `/customers/me`. Every route here resolves
 * `customerId` from `req.customer` (set by `resolveOwnCustomer`, itself derived only from the
 * caller's `req.user.sub`) — never from a param/query/body — so there is no route shape that
 * could ever be pointed at another customer's record. Ownership is the authorization; none
 * of these routes use `requirePermission`. Mirrors `driverSelf.routes.ts` exactly.
 */
const router = Router();

router.use(authenticate);
router.use(resolveOwnCustomer);

router.get('/', async (req, res, next) => {
  try {
    const customer = await customerService.getOwnCustomer(req.customer!.id);
    res.json({ data: customer, error: null });
  } catch (err) {
    next(err);
  }
});

// `verificationStatus`/`accountStatus`/`registrationSource`/`notes` stay staff-only:
// `UpdateOwnCustomerSchema` never accepts them, so there's nothing here that could
// self-verify or self-reactivate a customer.
router.patch('/', validateBody(UpdateOwnCustomerSchema), async (req, res, next) => {
  try {
    const customer = await customerService.updateOwnCustomer(req.customer!.id, req.body);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'customer.self.update',
      targetType: 'Customer',
      targetId: customer.id,
      after: customer,
      ...requestMeta(req),
    });
    res.json({ data: customer, error: null });
  } catch (err) {
    next(err);
  }
});

router.get('/bookings', async (req, res, next) => {
  try {
    const bookings = await customerService.listOwnBookings(req.customer!.id);
    res.json({ data: bookings, error: null, meta: { total: bookings.length } });
  } catch (err) {
    next(err);
  }
});

export default router;
