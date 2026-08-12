import { Router } from 'express';
import type { Request } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import {
  CategoryCreateSchema,
  CategoryUpdateSchema,
  CategoryStatusUpdateSchema,
  CategoryListQuerySchema,
} from '../schemas/category.schema';
import * as categoryService from '../services/category.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData } from '../lib/http';

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

router.get('/', requirePermission('masters.categories', 'view'), async (req, res, next) => {
  try {
    const { page, pageSize, search, scope, parentId } = CategoryListQuerySchema.parse(req.query);
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

export default router;
