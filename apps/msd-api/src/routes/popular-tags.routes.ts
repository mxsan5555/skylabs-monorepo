import { Router } from 'express';
import type { Request } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import {
  PopularTagCreateSchema,
  PopularTagUpdateSchema,
  PopularTagStatusUpdateSchema,
  PopularTagListQuerySchema,
  PopularTagMapSchema,
  PopularTagMappingParamsSchema,
} from '../schemas/popular-tag.schema';
import * as popularTagService from '../services/popular-tag.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData } from '../lib/http';

/**
 * Popular Tag admin CRUD + mapping — gated on `masters.tags` (the same permission the
 * "Marketing Tags" sidebar item already seeds/grants; see seed.ts's EXTRA_ACTIONS_BY_MENU_KEY),
 * mirroring `categories.routes.ts`'s exact shape.
 */
const router = Router();
router.use(authenticate);

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

router.get('/', requirePermission('masters.tags', 'view'), validateQuery(PopularTagListQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, search } = req.validatedQuery as ReturnType<typeof PopularTagListQuerySchema.parse>;
    const { items, total } = await popularTagService.listTags({ page, pageSize, search });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePermission('masters.tags', 'create'), validateBody(PopularTagCreateSchema), async (req, res, next) => {
  try {
    const tag = await popularTagService.createTag(req.body);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'popular_tag.create',
      targetType: 'PopularTag',
      targetId: tag.id,
      after: tag,
      ...requestMeta(req),
    });
    sendData(res, tag, { status: 201 });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requirePermission('masters.tags', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, await popularTagService.getTagOrThrow(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id',
  requirePermission('masters.tags', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(PopularTagUpdateSchema),
  async (req, res, next) => {
    try {
      const tag = await popularTagService.updateTag(req.params.id, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'popular_tag.update',
        targetType: 'PopularTag',
        targetId: tag.id,
        after: tag,
        ...requestMeta(req),
      });
      sendData(res, tag);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id/status',
  requirePermission('masters.tags', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(PopularTagStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const tag = await popularTagService.setTagStatus(req.params.id, req.body.isActive);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'popular_tag.status_change',
        targetType: 'PopularTag',
        targetId: tag.id,
        after: { isActive: tag.isActive },
        ...requestMeta(req),
      });
      sendData(res, tag);
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/:id', requirePermission('masters.tags', 'delete'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    const before = await popularTagService.getTagOrThrow(req.params.id);
    await popularTagService.deleteTag(req.params.id);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'popular_tag.delete',
      targetType: 'PopularTag',
      targetId: req.params.id,
      before,
      ...requestMeta(req),
    });
    sendData(res, null);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/mappings', requirePermission('masters.tags', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, await popularTagService.listMappings(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/mappings',
  requirePermission('masters.tags', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(PopularTagMapSchema),
  async (req, res, next) => {
    try {
      const { targetType, targetId } = req.body as { targetType: popularTagService.PopularTagTargetType; targetId: string };
      const mapping = await popularTagService.mapTag(req.params.id, targetType, targetId);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'popular_tag.map',
        targetType: 'PopularTag',
        targetId: req.params.id,
        after: { targetType, targetId },
        ...requestMeta(req),
      });
      sendData(res, mapping, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:id/mappings/:targetType/:targetId',
  requirePermission('masters.tags', 'edit'),
  validateParams(PopularTagMappingParamsSchema),
  async (req, res, next) => {
    try {
      const targetType = req.params.targetType as popularTagService.PopularTagTargetType;
      await popularTagService.unmapTag(req.params.id, targetType, req.params.targetId);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'popular_tag.unmap',
        targetType: 'PopularTag',
        targetId: req.params.id,
        before: { targetType, targetId: req.params.targetId },
        ...requestMeta(req),
      });
      sendData(res, { unmapped: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
