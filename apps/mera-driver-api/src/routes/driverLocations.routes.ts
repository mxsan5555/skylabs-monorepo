import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody } from '../middleware/validate';
import * as auditService from '../services/audit.service';
import * as driverLocationService from '../services/driverLocation.service';
import { CreateDriverLocationSchema, UpdateDriverLocationSchema } from '../schemas/trips.schema';
import { requestMeta } from '../lib/requestMeta';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('trips.driver-locations', 'view'), async (_req, res, next) => {
  try {
    const rows = await driverLocationService.listDriverLocations();
    res.json({ data: rows, error: null, meta: { total: rows.length } });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requirePermission('trips.driver-locations', 'create'),
  validateBody(CreateDriverLocationSchema),
  async (req, res, next) => {
    try {
      const row = await driverLocationService.createDriverLocation(req.body);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'driverLocation.create',
        targetType: 'DriverLocation',
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
  requirePermission('trips.driver-locations', 'edit'),
  validateBody(UpdateDriverLocationSchema),
  async (req, res, next) => {
    try {
      const row = await driverLocationService.updateDriverLocation(req.params.id, req.body);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'driverLocation.update',
        targetType: 'DriverLocation',
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

router.delete('/:id', requirePermission('trips.driver-locations', 'delete'), async (req, res, next) => {
  try {
    await driverLocationService.deleteDriverLocation(req.params.id);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'driverLocation.delete',
      targetType: 'DriverLocation',
      targetId: req.params.id,
      ...requestMeta(req),
    });
    res.json({ data: { id: req.params.id }, error: null });
  } catch (err) {
    next(err);
  }
});

export default router;
