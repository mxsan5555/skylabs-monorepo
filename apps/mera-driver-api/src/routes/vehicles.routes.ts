import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody } from '../middleware/validate';
import * as auditService from '../services/audit.service';
import * as vehicleService from '../services/vehicle.service';
import { CreateVehicleSchema, UpdateVehicleSchema } from '../schemas/business.schema';
import { requestMeta } from '../lib/requestMeta';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('vehicles', 'view'), async (_req, res, next) => {
  try {
    const rows = await vehicleService.listVehicles();
    res.json({ data: rows, error: null, meta: { total: rows.length } });
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePermission('vehicles', 'create'), validateBody(CreateVehicleSchema), async (req, res, next) => {
  try {
    const vehicle = await vehicleService.createVehicle(req.body);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'vehicle.create',
      targetType: 'Vehicle',
      targetId: vehicle.id,
      after: vehicle,
      ...requestMeta(req),
    });
    res.status(201).json({ data: vehicle, error: null });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requirePermission('vehicles', 'edit'), validateBody(UpdateVehicleSchema), async (req, res, next) => {
  try {
    const vehicle = await vehicleService.updateVehicle(req.params.id, req.body);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'vehicle.update',
      targetType: 'Vehicle',
      targetId: vehicle.id,
      after: vehicle,
      ...requestMeta(req),
    });
    res.json({ data: vehicle, error: null });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requirePermission('vehicles', 'delete'), async (req, res, next) => {
  try {
    await vehicleService.deleteVehicle(req.params.id);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'vehicle.delete',
      targetType: 'Vehicle',
      targetId: req.params.id,
      ...requestMeta(req),
    });
    res.json({ data: { id: req.params.id }, error: null });
  } catch (err) {
    next(err);
  }
});

export default router;
