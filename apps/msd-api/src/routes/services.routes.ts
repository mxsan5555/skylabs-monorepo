import { Router } from 'express';
import type { Request } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import {
  ServiceCreateSchema,
  ServiceUpdateSchema,
  ServiceStatusUpdateSchema,
  ServiceListQuerySchema,
} from '../schemas/service.schema';
import * as serviceService from '../services/service.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData } from '../lib/http';

/** Marketplace service catalog admin CRUD — gated on the `services` permission key
 *  (admin/super_admin full CRUD; vendor read-only, same pattern as `products`). */
const router = Router();
router.use(authenticate);

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

router.get('/', requirePermission('services', 'view'), async (req, res, next) => {
  try {
    const { page, pageSize, search, categoryId, subcategoryId, status } = ServiceListQuerySchema.parse(req.query);
    const { items, total } = await serviceService.listServices({ page, pageSize, search, categoryId, subcategoryId, status });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePermission('services', 'create'), validateBody(ServiceCreateSchema), async (req, res, next) => {
  try {
    const service = await serviceService.createService(req.body);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'service.create',
      targetType: 'Service',
      targetId: service.id,
      after: service,
      ...requestMeta(req),
    });
    sendData(res, service, { status: 201 });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requirePermission('services', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, await serviceService.getServiceOrThrow(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id',
  requirePermission('services', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(ServiceUpdateSchema),
  async (req, res, next) => {
    try {
      const service = await serviceService.updateService(req.params.id, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'service.update',
        targetType: 'Service',
        targetId: service.id,
        after: service,
        ...requestMeta(req),
      });
      sendData(res, service);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id/status',
  requirePermission('services', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(ServiceStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const service = await serviceService.setServiceStatus(req.params.id, req.body.isActive);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'service.status_change',
        targetType: 'Service',
        targetId: service.id,
        after: { isActive: service.isActive },
        ...requestMeta(req),
      });
      sendData(res, service);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:id',
  requirePermission('services', 'delete'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      const before = await serviceService.getServiceOrThrow(req.params.id);
      await serviceService.deleteService(req.params.id);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'service.delete',
        targetType: 'Service',
        targetId: req.params.id,
        before,
        ...requestMeta(req),
      });
      sendData(res, null);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
