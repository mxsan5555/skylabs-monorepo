import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody } from '../middleware/validate';
import * as auditService from '../services/audit.service';
import * as serviceZoneService from '../services/serviceZone.service';
import { CreateServiceZoneSchema, UpdateServiceZoneSchema } from '../schemas/masters.schema';
import { requestMeta } from '../lib/requestMeta';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('masters.zones', 'view'), async (_req, res, next) => {
  try {
    const rows = await serviceZoneService.listServiceZones();
    res.json({ data: rows, error: null, meta: { total: rows.length } });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requirePermission('masters.zones', 'create'),
  validateBody(CreateServiceZoneSchema),
  async (req, res, next) => {
    try {
      const row = await serviceZoneService.createServiceZone(req.body);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'serviceZone.create',
        targetType: 'ServiceZone',
        targetId: row.id,
        after: row,
        ...requestMeta(req),
      });
      res.status(201).json({ data: row, error: null });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id',
  requirePermission('masters.zones', 'edit'),
  validateBody(UpdateServiceZoneSchema),
  async (req, res, next) => {
    try {
      const row = await serviceZoneService.updateServiceZone(req.params.id, req.body);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'serviceZone.update',
        targetType: 'ServiceZone',
        targetId: row.id,
        after: row,
        ...requestMeta(req),
      });
      res.json({ data: row, error: null });
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/:id', requirePermission('masters.zones', 'delete'), async (req, res, next) => {
  try {
    await serviceZoneService.deleteServiceZone(req.params.id);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'serviceZone.delete',
      targetType: 'ServiceZone',
      targetId: req.params.id,
      ...requestMeta(req),
    });
    res.json({ data: { id: req.params.id }, error: null });
  } catch (err) {
    next(err);
  }
});

export default router;
