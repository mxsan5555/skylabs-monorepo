import { Router } from 'express';
import type { Request } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import {
  PromotionCreateSchema,
  PromotionUpdateSchema,
  PromotionStatusUpdateSchema,
  PromotionListQuerySchema,
} from '../schemas/promotion.schema';
import { MediaReorderSchema } from '../schemas/media.schema';
import * as promotionService from '../services/promotion.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData, ApiError } from '../lib/http';
import { imageUpload } from '../lib/media-upload.middleware';

/**
 * Home page "Promotions" admin CRUD — gated on `masters.promotions`, mirroring
 * `popular-treatments.routes.ts`'s exact shape (list/create/get/patch/status/delete) plus
 * `categories.routes.ts`'s media sub-routes (image-only, no video — see media.service.ts).
 */
const router = Router();
router.use(authenticate);

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

router.get('/', requirePermission('masters.promotions', 'view'), validateQuery(PromotionListQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, search } = req.validatedQuery as ReturnType<typeof PromotionListQuerySchema.parse>;
    const { items, total } = await promotionService.listPromotions({ page, pageSize, search });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePermission('masters.promotions', 'create'), validateBody(PromotionCreateSchema), async (req, res, next) => {
  try {
    const promotion = await promotionService.createPromotion(req.body);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'promotion.create',
      targetType: 'Promotion',
      targetId: promotion.id,
      after: promotion,
      ...requestMeta(req),
    });
    sendData(res, promotion, { status: 201 });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requirePermission('masters.promotions', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, await promotionService.getPromotionOrThrow(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id',
  requirePermission('masters.promotions', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(PromotionUpdateSchema),
  async (req, res, next) => {
    try {
      const promotion = await promotionService.updatePromotion(req.params.id, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'promotion.update',
        targetType: 'Promotion',
        targetId: promotion.id,
        after: promotion,
        ...requestMeta(req),
      });
      sendData(res, promotion);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id/status',
  requirePermission('masters.promotions', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(PromotionStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const promotion = await promotionService.setPromotionStatus(req.params.id, req.body.isActive);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'promotion.status_change',
        targetType: 'Promotion',
        targetId: promotion.id,
        after: { isActive: promotion.isActive },
        ...requestMeta(req),
      });
      sendData(res, promotion);
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/:id', requirePermission('masters.promotions', 'delete'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    const before = await promotionService.getPromotionOrThrow(req.params.id);
    await promotionService.deletePromotion(req.params.id);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'promotion.delete',
      targetType: 'Promotion',
      targetId: req.params.id,
      before,
      ...requestMeta(req),
    });
    sendData(res, null);
  } catch (err) {
    next(err);
  }
});

// ─── Promotion media (shared upload system — see media.service.ts's doc comment) ────────────

router.post(
  '/:id/images',
  requirePermission('masters.promotions', 'edit'),
  validateParams(UuidParamSchema),
  imageUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded.');
      const image = await promotionService.addPromotionImage(req.params.id, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
      });
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'promotion_image.create',
        targetType: 'PromotionImage',
        targetId: image.id,
        ...requestMeta(req),
      });
      sendData(res, image, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:id/images/:imageId',
  requirePermission('masters.promotions', 'edit'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      await promotionService.deletePromotionImage(req.params.id, req.params.imageId);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'promotion_image.delete',
        targetType: 'PromotionImage',
        targetId: req.params.imageId,
        ...requestMeta(req),
      });
      sendData(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id/images/reorder',
  requirePermission('masters.promotions', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(MediaReorderSchema),
  async (req, res, next) => {
    try {
      await promotionService.reorderPromotionImages(req.params.id, req.body.imageIds);
      sendData(res, { reordered: true });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id/images/:imageId/primary',
  requirePermission('masters.promotions', 'edit'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      await promotionService.setPromotionPrimaryImage(req.params.id, req.params.imageId);
      sendData(res, { primary: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
