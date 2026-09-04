import { Router } from 'express';
import type { Request } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import {
  CategoryCreateSchema,
  CategoryUpdateSchema,
  CategoryStatusUpdateSchema,
  CategoryListQuerySchema,
} from '../schemas/category.schema';
import { MediaReorderSchema } from '../schemas/media.schema';
import * as categoryService from '../services/category.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData, ApiError } from '../lib/http';
import { imageUpload } from '../lib/media-upload.middleware';

/**
 * Categories AND Sub Categories admin CRUD — one router, one Category table (a row with a
 * non-null parentId IS a subcategory), gated uniformly on `masters.categories` since it's the
 * same resource either way. `masters.sub-categories` (the second sidebar item) only needs its
 * own Permission rows for menu *visibility* — see the note in seed.ts's EXTRA_ACTIONS_BY_MENU_KEY.
 */
const router = Router();
router.use(authenticate);

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

router.get('/', requirePermission('masters.categories', 'view'), validateQuery(CategoryListQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, search, scope, parentId } = req.validatedQuery as ReturnType<typeof CategoryListQuerySchema.parse>;
    const { items, total } = await categoryService.listCategories({ page, pageSize, search, scope, parentId });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requirePermission('masters.categories', 'create'),
  validateBody(CategoryCreateSchema),
  async (req, res, next) => {
    try {
      const category = await categoryService.createCategory(req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'category.create',
        targetType: 'Category',
        targetId: category.id,
        after: category,
        ...requestMeta(req),
      });
      sendData(res, category, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/:id', requirePermission('masters.categories', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, await categoryService.getCategoryOrThrow(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id',
  requirePermission('masters.categories', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(CategoryUpdateSchema),
  async (req, res, next) => {
    try {
      const category = await categoryService.updateCategory(req.params.id, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'category.update',
        targetType: 'Category',
        targetId: category.id,
        after: category,
        ...requestMeta(req),
      });
      sendData(res, category);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id/status',
  requirePermission('masters.categories', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(CategoryStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const category = await categoryService.setCategoryStatus(req.params.id, req.body.isActive);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'category.status_change',
        targetType: 'Category',
        targetId: category.id,
        after: { isActive: category.isActive },
        ...requestMeta(req),
      });
      sendData(res, category);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:id',
  requirePermission('masters.categories', 'delete'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      const before = await categoryService.getCategoryOrThrow(req.params.id);
      await categoryService.deleteCategory(req.params.id);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'category.delete',
        targetType: 'Category',
        targetId: req.params.id,
        before,
        ...requestMeta(req),
      });
      sendData(res, null);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Category media (shared upload system — see media.service.ts's doc comment). Gated on the
// same 'masters.categories' permission as the rest of this router, for all three depth tiers
// (Category/Subcategory/Type) — see category.service.ts's Category-media section doc comment. ──

router.post(
  '/:id/images',
  requirePermission('masters.categories', 'edit'),
  validateParams(UuidParamSchema),
  imageUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded.');
      const image = await categoryService.addCategoryImage(req.params.id, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
      });
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'category_image.create',
        targetType: 'CategoryImage',
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
  requirePermission('masters.categories', 'edit'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      await categoryService.deleteCategoryImage(req.params.id, req.params.imageId);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'category_image.delete',
        targetType: 'CategoryImage',
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
  requirePermission('masters.categories', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(MediaReorderSchema),
  async (req, res, next) => {
    try {
      await categoryService.reorderCategoryImages(req.params.id, req.body.imageIds);
      sendData(res, { reordered: true });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id/images/:imageId/primary',
  requirePermission('masters.categories', 'edit'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      await categoryService.setCategoryPrimaryImage(req.params.id, req.params.imageId);
      sendData(res, { primary: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
