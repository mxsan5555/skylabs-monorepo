import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody } from '../middleware/validate';
import * as auditService from '../services/audit.service';
import * as cancellationReasonService from '../services/cancellationReason.service';
import { CreateCancellationReasonSchema, UpdateCancellationReasonSchema } from '../schemas/trips.schema';
import { requestMeta } from '../lib/requestMeta';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('trips.cancellation-reasons', 'view'), async (_req, res, next) => {
  try {
    const rows = await cancellationReasonService.listCancellationReasons();
    res.json({ data: rows, error: null, meta: { total: rows.length } });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requirePermission('trips.cancellation-reasons', 'create'),
  validateBody(CreateCancellationReasonSchema),
  async (req, res, next) => {
    try {
      const row = await cancellationReasonService.createCancellationReason(req.body);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'cancellationReason.create',
        targetType: 'CancellationReason',
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
  requirePermission('trips.cancellation-reasons', 'edit'),
  validateBody(UpdateCancellationReasonSchema),
  async (req, res, next) => {
    try {
      const row = await cancellationReasonService.updateCancellationReason(req.params.id, req.body);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'cancellationReason.update',
        targetType: 'CancellationReason',
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

router.delete('/:id', requirePermission('trips.cancellation-reasons', 'delete'), async (req, res, next) => {
  try {
    await cancellationReasonService.deleteCancellationReason(req.params.id);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'cancellationReason.delete',
      targetType: 'CancellationReason',
      targetId: req.params.id,
      ...requestMeta(req),
    });
    res.json({ data: { id: req.params.id }, error: null });
  } catch (err) {
    next(err);
  }
});

export default router;
