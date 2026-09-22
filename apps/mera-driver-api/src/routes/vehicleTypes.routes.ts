import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody } from '../middleware/validate';
import * as auditService from '../services/audit.service';
import * as vehicleTypeService from '../services/vehicleType.service';
import { CreateVehicleTypeSchema, UpdateVehicleTypeSchema } from '../schemas/masters.schema';
import { requestMeta } from '../lib/requestMeta';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('masters.vehicle-types', 'view'), async (_req, res, next) => {
  try {
    const rows = await vehicleTypeService.listVehicleTypes();
    res.json({ data: rows, error: null, meta: { total: rows.length } });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requirePermission('masters.vehicle-types', 'create'),
  validateBody(CreateVehicleTypeSchema),
  async (req, res, next) => {
    try {
      const row = await vehicleTypeService.createVehicleType(req.body);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'vehicleType.create',
        targetType: 'VehicleType',
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
  requirePermission('masters.vehicle-types', 'edit'),
  validateBody(UpdateVehicleTypeSchema),
  async (req, res, next) => {
    try {
      const row = await vehicleTypeService.updateVehicleType(req.params.id, req.body);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'vehicleType.update',
        targetType: 'VehicleType',
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

router.delete('/:id', requirePermission('masters.vehicle-types', 'delete'), async (req, res, next) => {
  try {
    await vehicleTypeService.deleteVehicleType(req.params.id);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'vehicleType.delete',
      targetType: 'VehicleType',
      targetId: req.params.id,
      ...requestMeta(req),
    });
    res.json({ data: { id: req.params.id }, error: null });
  } catch (err) {
    next(err);
  }
});

export default router;
