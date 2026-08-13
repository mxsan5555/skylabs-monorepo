import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateParams } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import { CustomerListQuerySchema } from '../schemas/customer.schema';
import * as customerService from '../services/customer.service';
import { sendData } from '../lib/http';

/**
 * SuperAdmin/staff customer directory — `customers:view` (already seeded, granted to
 * super_admin/admin). Read-only: a customer's own data is still only ever editable by the
 * customer themself via the storefront `/my-account` flow, never here.
 */
const router = Router();
router.use(authenticate);

router.get('/', requirePermission('customers', 'view'), async (req, res, next) => {
  try {
    const { page, pageSize, search, status } = CustomerListQuerySchema.parse(req.query);
    const { items, total } = await customerService.listCustomers({ page, pageSize, search, status });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requirePermission('customers', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, await customerService.getCustomerOrThrow(req.params.id));
  } catch (err) {
    next(err);
  }
});

export default router;
