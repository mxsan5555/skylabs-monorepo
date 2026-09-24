import { Router } from 'express';
import type { Request } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import {
  PopularTreatmentGroupCreateSchema,
  PopularTreatmentGroupUpdateSchema,
  PopularTreatmentGroupStatusUpdateSchema,
  PopularTreatmentGroupListQuerySchema,
  PopularTreatmentCreateSchema,
  PopularTreatmentUpdateSchema,
  PopularTreatmentStatusUpdateSchema,
  PopularTreatmentListQuerySchema,
} from '../schemas/popular-treatment.schema';
import * as popularTreatmentService from '../services/popular-treatment.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData } from '../lib/http';

/**
 * Popular Treatment (groups + chips) admin CRUD — gated on `masters.popular-treatments`, the
 * Master menu's third sidebar item (after Categories/Sub Categories/Marketing Tags), mirroring
 * `popular-tags.routes.ts`'s exact shape. No mapping sub-routes (unlike Popular Tags) — a
 * treatment has no direct Deal/Product/Therapist link, see `PopularTreatment`'s schema doc
 * comment.
 */
const router = Router();
router.use(authenticate);

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

// ─── Groups ────────────────────────────────────────────────────────────────────────────────

router.get('/groups', requirePermission('masters.popular-treatments', 'view'), validateQuery(PopularTreatmentGroupListQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, search } = req.validatedQuery as ReturnType<typeof PopularTreatmentGroupListQuerySchema.parse>;
    const { items, total } = await popularTreatmentService.listGroups({ page, pageSize, search });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.get('/groups/all', requirePermission('masters.popular-treatments', 'view'), async (_req, res, next) => {
  try {
    sendData(res, await popularTreatmentService.listAllGroups());
  } catch (err) {
    next(err);
  }
});

router.post('/groups', requirePermission('masters.popular-treatments', 'create'), validateBody(PopularTreatmentGroupCreateSchema), async (req, res, next) => {
  try {
    const group = await popularTreatmentService.createGroup(req.body);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'popular_treatment_group.create',
      targetType: 'PopularTreatmentGroup',
      targetId: group.id,
      after: group,
      ...requestMeta(req),
    });
    sendData(res, group, { status: 201 });
  } catch (err) {
    next(err);
  }
});

router.get('/groups/:id', requirePermission('masters.popular-treatments', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, await popularTreatmentService.getGroupOrThrow(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/groups/:id',
  requirePermission('masters.popular-treatments', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(PopularTreatmentGroupUpdateSchema),
  async (req, res, next) => {
    try {
      const group = await popularTreatmentService.updateGroup(req.params.id, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'popular_treatment_group.update',
        targetType: 'PopularTreatmentGroup',
        targetId: group.id,
        after: group,
        ...requestMeta(req),
      });
      sendData(res, group);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/groups/:id/status',
  requirePermission('masters.popular-treatments', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(PopularTreatmentGroupStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const group = await popularTreatmentService.setGroupStatus(req.params.id, req.body.isActive);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'popular_treatment_group.status_change',
        targetType: 'PopularTreatmentGroup',
        targetId: group.id,
        after: { isActive: group.isActive },
        ...requestMeta(req),
      });
      sendData(res, group);
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/groups/:id', requirePermission('masters.popular-treatments', 'delete'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    const before = await popularTreatmentService.getGroupOrThrow(req.params.id);
    await popularTreatmentService.deleteGroup(req.params.id);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'popular_treatment_group.delete',
      targetType: 'PopularTreatmentGroup',
      targetId: req.params.id,
      before,
      ...requestMeta(req),
    });
    sendData(res, null);
  } catch (err) {
    next(err);
  }
});

// ─── Treatments ────────────────────────────────────────────────────────────────────────────

router.get('/', requirePermission('masters.popular-treatments', 'view'), validateQuery(PopularTreatmentListQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, search, groupId } = req.validatedQuery as ReturnType<typeof PopularTreatmentListQuerySchema.parse>;
    const { items, total } = await popularTreatmentService.listTreatments({ page, pageSize, search, groupId });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePermission('masters.popular-treatments', 'create'), validateBody(PopularTreatmentCreateSchema), async (req, res, next) => {
  try {
    const treatment = await popularTreatmentService.createTreatment(req.body);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'popular_treatment.create',
      targetType: 'PopularTreatment',
      targetId: treatment.id,
      after: treatment,
      ...requestMeta(req),
    });
    sendData(res, treatment, { status: 201 });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requirePermission('masters.popular-treatments', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, await popularTreatmentService.getTreatmentOrThrow(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id',
  requirePermission('masters.popular-treatments', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(PopularTreatmentUpdateSchema),
  async (req, res, next) => {
    try {
      const treatment = await popularTreatmentService.updateTreatment(req.params.id, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'popular_treatment.update',
        targetType: 'PopularTreatment',
        targetId: treatment.id,
        after: treatment,
        ...requestMeta(req),
      });
      sendData(res, treatment);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id/status',
  requirePermission('masters.popular-treatments', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(PopularTreatmentStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const treatment = await popularTreatmentService.setTreatmentStatus(req.params.id, req.body.isActive);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'popular_treatment.status_change',
        targetType: 'PopularTreatment',
        targetId: treatment.id,
        after: { isActive: treatment.isActive },
        ...requestMeta(req),
      });
      sendData(res, treatment);
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/:id', requirePermission('masters.popular-treatments', 'delete'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    const before = await popularTreatmentService.getTreatmentOrThrow(req.params.id);
    await popularTreatmentService.deleteTreatment(req.params.id);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'popular_treatment.delete',
      targetType: 'PopularTreatment',
      targetId: req.params.id,
      before,
      ...requestMeta(req),
    });
    sendData(res, null);
  } catch (err) {
    next(err);
  }
});

export default router;
