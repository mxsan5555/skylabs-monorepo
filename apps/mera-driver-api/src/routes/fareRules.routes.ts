import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody } from '../middleware/validate';
import * as auditService from '../services/audit.service';
import * as fareRuleService from '../services/fareRule.service';
import { CreateFareRuleSchema, UpdateFareRuleSchema } from '../schemas/trips.schema';
import { requestMeta } from '../lib/requestMeta';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('trips.pricing', 'view'), async (_req, res, next) => {
  try {
    const rows = await fareRuleService.listFareRules();
    res.json({ data: rows, error: null, meta: { total: rows.length } });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requirePermission('trips.pricing', 'create'),
  validateBody(CreateFareRuleSchema),
  async (req, res, next) => {
    try {
      const row = await fareRuleService.createFareRule(req.body);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'fareRule.create',
        targetType: 'FareRule',
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
  requirePermission('trips.pricing', 'edit'),
  validateBody(UpdateFareRuleSchema),
  async (req, res, next) => {
    try {
      const row = await fareRuleService.updateFareRule(req.params.id, req.body);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'fareRule.update',
        targetType: 'FareRule',
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

router.delete('/:id', requirePermission('trips.pricing', 'delete'), async (req, res, next) => {
  try {
    await fareRuleService.deleteFareRule(req.params.id);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'fareRule.delete',
      targetType: 'FareRule',
      targetId: req.params.id,
      ...requestMeta(req),
    });
    res.json({ data: { id: req.params.id }, error: null });
  } catch (err) {
    next(err);
  }
});

export default router;
