import {z} from 'zod';
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody } from '../middleware/validate';
import * as auditService from '../services/audit.service';
import * as customerService from '../services/customer.service';
import { CreateCustomerSchema, UpdateCustomerSchema, LinkCustomerToUserSchema } from '../schemas/business.schema';
import { customerOwnerScope } from '../lib/ownerScope';
import { HttpError } from '../middleware/errorHandler';
import { requestMeta } from '../lib/requestMeta';

const router = Router();

router.use(authenticate);

async function assertCustomerScope(req: import('express').Request): Promise<void> {
  const owner = customerOwnerScope(req);
  if (!owner) return;
  const row = await customerService.getCustomerById(req.params.id);
  if (row.createdByUserId !== owner) throw new HttpError(404, 'NOT_FOUND', 'Customer not found');
}

router.get('/', requirePermission('customers', 'view'), async (req, res, next) => {
  try {
    const query=z.object({page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(25),search:z.string().max(150).optional(),sort:z.string().max(50).optional(),direction:z.enum(['asc','desc']).optional(),status:z.enum(['Active','Inactive','Blocked']).optional()}).parse(req.query);
    const result=await customerService.searchCustomers(query, customerOwnerScope(req));
    res.json({data:result.rows,error:null,meta:result.meta});
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePermission('customers', 'create'), validateBody(CreateCustomerSchema), async (req, res, next) => {
  try {
    const customer = await customerService.createCustomer({...req.body, createdByUserId: req.user!.sub});
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
    await assertCustomerScope(req);
    const previous=await customerService.getCustomerById(req.params.id);
    const customer = await customerService.updateCustomer(req.params.id, req.body);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: previous.accountStatus!==customer.accountStatus?'customer.status_change':'customer.update',
      before:{accountStatus:previous.accountStatus},
      targetType: 'Customer',
      targetId: customer.id,
      after: {...customer,statusReason:req.body.statusReason??null,acknowledgeActiveBookings:req.body.acknowledgeActiveBookings??false},
      ...requestMeta(req),
    });
    res.json({ data: customer, error: null });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requirePermission('customers', 'delete'), async (req, res, next) => {
  try {
    await assertCustomerScope(req);
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
      await assertCustomerScope(req);
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
    await assertCustomerScope(req);
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
    await assertCustomerScope(req);
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
