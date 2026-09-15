import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody } from '../middleware/validate';
import * as auditService from '../services/audit.service';
import * as tripTypeService from '../services/tripType.service';
import { CreateTripTypeSchema, UpdateTripTypeSchema } from '../schemas/trips.schema';
import { requestMeta } from '../lib/requestMeta';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('trips.trip-types', 'view'), async (_req, res, next) => {
  try {
    const rows = await tripTypeService.listTripTypes();
    res.json({ data: rows, error: null, meta: { total: rows.length } });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requirePermission('trips.trip-types', 'create'),
  validateBody(CreateTripTypeSchema),
  async (req, res, next) => {
    try {
      const row = await tripTypeService.createTripType(req.body);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'tripType.create',
        targetType: 'TripType',
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
  requirePermission('trips.trip-types', 'edit'),
  validateBody(UpdateTripTypeSchema),
  async (req, res, next) => {
    try {
      const row = await tripTypeService.updateTripType(req.params.id, req.body);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'tripType.update',
        targetType: 'TripType',
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

router.delete('/:id', requirePermission('trips.trip-types', 'delete'), async (req, res, next) => {
  try {
    await tripTypeService.deleteTripType(req.params.id);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'tripType.delete',
      targetType: 'TripType',
      targetId: req.params.id,
      ...requestMeta(req),
    });
    res.json({ data: { id: req.params.id }, error: null });
  } catch (err) {
    next(err);
  }
});

export default router;
