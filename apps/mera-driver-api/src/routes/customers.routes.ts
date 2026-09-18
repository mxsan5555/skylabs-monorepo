import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody } from '../middleware/validate';
import * as auditService from '../services/audit.service';
import * as customerService from '../services/customer.service';
import { CreateCustomerSchema, UpdateCustomerSchema, LinkCustomerToUserSchema } from '../schemas/business.schema';
import { requestMeta } from '../lib/requestMeta';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('customers', 'view'), async (_req, res, next) => {
  try {
    const rows = await customerService.listCustomers();
    res.json({ data: rows, error: null, meta: { total: rows.length } });
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePermission('customers', 'create'), validateBody(CreateCustomerSchema), async (req, res, next) => {
  try {
    const customer = await customerService.createCustomer(req.body);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'customer.create',
      targetType: 'Customer',
      targetId: customer.id,
      after: customer,
      ...requestMeta(req),
    });
    res.status(201).json({ data: customer, error: null });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requirePermission('customers', 'edit'), validateBody(UpdateCustomerSchema), async (req, res, next) => {
  try {
    const customer = await customerService.updateCustomer(req.params.id, req.body);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'customer.update',
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

router.delete('/:id', requirePermission('customers', 'delete'), async (req, res, next) => {
  try {
    await customerService.deleteCustomer(req.params.id);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'customer.delete',
      targetType: 'Customer',
      targetId: req.params.id,
      ...requestMeta(req),
    });
    res.json({ data: { id: req.params.id }, error: null });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Customer <-> User linkage (grants/revokes self-service portal access). Mirrors the
// Driver <-> User linkage routes in `drivers.routes.ts` exactly.
// ---------------------------------------------------------------------------

router.patch(
  '/:id/link-user',
  requirePermission('customers', 'assign'),
  validateBody(LinkCustomerToUserSchema),
  async (req, res, next) => {
    try {
      const customer = await customerService.linkCustomerToUser(req.params.id, req.body.userId);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'customer.link',
        targetType: 'Customer',
        targetId: customer.id,
        after: { userId: req.body.userId },
        ...requestMeta(req),
      });
      res.json({ data: customer, error: null });
    } catch (err) {
      next(err);
    }
  },
);

router.patch('/:id/unlink-user', requirePermission('customers', 'assign'), async (req, res, next) => {
  try {
    const customer = await customerService.unlinkCustomerFromUser(req.params.id);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'customer.unlink',
      targetType: 'Customer',
      targetId: customer.id,
      ...requestMeta(req),
    });
    res.json({ data: customer, error: null });
  } catch (err) {
    next(err);
  }
});

// One-click Customer User creation: creates the User, assigns the `customer` role, and
// links it, all server-side — no existing-user picker. Mirrors `POST /drivers/:id/create-user`.
router.post('/:id/create-user', requirePermission('customers', 'assign'), async (req, res, next) => {
  try {
    const customer = await customerService.createAndLinkCustomerUser(req.params.id);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'customer.user.create',
      targetType: 'Customer',
      targetId: customer.id,
      after: { userId: customer.userId },
      ...requestMeta(req),
    });
    res.status(201).json({ data: customer, error: null });
  } catch (err) {
    next(err);
  }
});

export default router;
