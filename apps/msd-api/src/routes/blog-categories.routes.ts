import { Router } from 'express';
import type { Request } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import { BlogCategoryCreateSchema, BlogCategoryUpdateSchema, BlogCategoryListQuerySchema } from '../schemas/blog-category.schema';
import * as blogCategoryService from '../services/blog-category.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData } from '../lib/http';

/**
 * Blog Categories admin CRUD — mirrors faqs.routes.ts's structure exactly (one router, gated on
 * the single 'cms.blog-category' menu key for every action, no media sub-routes, no separate
 * /status route — isActive is a plain field on PATCH /:id).
 */
const router = Router();
router.use(authenticate);

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

router.get('/', requirePermission('cms.blog-category', 'view'), validateQuery(BlogCategoryListQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, search } = req.validatedQuery as ReturnType<typeof BlogCategoryListQuerySchema.parse>;
    const { items, total } = await blogCategoryService.listBlogCategories({ page, pageSize, search });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requirePermission('cms.blog-category', 'create'),
  validateBody(BlogCategoryCreateSchema),
  async (req, res, next) => {
    try {
      const category = await blogCategoryService.createBlogCategory(req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'blog_category.create',
        targetType: 'BlogCategory',
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

router.get('/:id', requirePermission('cms.blog-category', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, await blogCategoryService.getBlogCategoryOrThrow(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id',
  requirePermission('cms.blog-category', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(BlogCategoryUpdateSchema),
  async (req, res, next) => {
    try {
      const category = await blogCategoryService.updateBlogCategory(req.params.id, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'blog_category.update',
        targetType: 'BlogCategory',
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

router.delete(
  '/:id',
  requirePermission('cms.blog-category', 'delete'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      const before = await blogCategoryService.getBlogCategoryOrThrow(req.params.id);
      await blogCategoryService.deleteBlogCategory(req.params.id);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'blog_category.delete',
        targetType: 'BlogCategory',
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
