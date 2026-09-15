import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody } from '../middleware/validate';
import * as auditService from '../services/audit.service';
import * as customerService from '../services/customer.service';
import { CreateCustomerSchema, UpdateCustomerSchema } from '../schemas/business.schema';
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

export default router;
