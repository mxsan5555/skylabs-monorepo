import { Router } from 'express';
import type { Request } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import { CustomerListQuerySchema, CustomerStatusUpdateSchema } from '../schemas/customer.schema';
import * as customerService from '../services/customer.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData } from '../lib/http';

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

/**
 * SuperAdmin/staff customer directory — `customers:view` (already seeded, granted to
 * super_admin/admin). Mostly read-only: a customer's own data is still only ever editable by
 * the customer themself via the storefront `/my-account` flow — the one exception is account
 * status (Active/Inactive/Suspended), gated on its own `customers:status_change` permission
 * below, never the RBAC Users screen's `rbac.users:status_change`.
 */
const router = Router();
router.use(authenticate);

router.get('/', requirePermission('customers', 'view'), validateQuery(CustomerListQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, search, status } = req.validatedQuery as ReturnType<typeof CustomerListQuerySchema.parse>;
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

router.patch(
  '/:id/status',
  requirePermission('customers', 'status_change'),
  validateParams(UuidParamSchema),
  validateBody(CustomerStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const { customer, previousStatus } = await customerService.setCustomerStatus(req.params.id, req.body.status);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'customer.status_change',
        targetType: 'User',
        targetId: customer.id,
        before: { status: previousStatus },
        after: { status: customer.status },
        ...requestMeta(req),
      });
      sendData(res, customer);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
