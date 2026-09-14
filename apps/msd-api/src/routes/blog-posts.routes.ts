import { Router } from 'express';
import type { Request } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import {
  BlogPostCreateSchema,
  BlogPostUpdateSchema,
  BlogPostStatusUpdateSchema,
  BlogPostListQuerySchema,
} from '../schemas/blog-post.schema';
import { MediaReorderSchema } from '../schemas/media.schema';
import * as blogPostService from '../services/blog-post.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData, ApiError } from '../lib/http';
import { imageUpload } from '../lib/media-upload.middleware';

/**
 * Blog Posts admin CRUD — mirrors categories.routes.ts's structure exactly (one router, gated on
 * the single 'cms.blog' menu key for every action).
 */
const router = Router();
router.use(authenticate);

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

router.get('/', requirePermission('cms.blog', 'view'), validateQuery(BlogPostListQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, search, status, categorySlug } = req.validatedQuery as ReturnType<typeof BlogPostListQuerySchema.parse>;
    const { items, total } = await blogPostService.listBlogPosts({ page, pageSize, search, status, categorySlug });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requirePermission('cms.blog', 'create'),
  validateBody(BlogPostCreateSchema),
  async (req, res, next) => {
    try {
      const post = await blogPostService.createBlogPost(req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'blog_post.create',
        targetType: 'BlogPost',
        targetId: post.id,
        after: post,
        ...requestMeta(req),
      });
      sendData(res, post, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/:id', requirePermission('cms.blog', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, await blogPostService.getBlogPostOrThrow(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id',
  requirePermission('cms.blog', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(BlogPostUpdateSchema),
  async (req, res, next) => {
    try {
      const post = await blogPostService.updateBlogPost(req.params.id, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'blog_post.update',
        targetType: 'BlogPost',
        targetId: post.id,
        after: post,
        ...requestMeta(req),
      });
      sendData(res, post);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id/status',
  requirePermission('cms.blog', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(BlogPostStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const post = await blogPostService.setBlogPostStatus(req.params.id, req.body.status);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'blog_post.status_change',
        targetType: 'BlogPost',
        targetId: post.id,
        after: { status: post.status, publishedAt: post.publishedAt },
        ...requestMeta(req),
      });
      sendData(res, post);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:id',
  requirePermission('cms.blog', 'delete'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      const before = await blogPostService.getBlogPostOrThrow(req.params.id);
      await blogPostService.deleteBlogPost(req.params.id);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'blog_post.delete',
        targetType: 'BlogPost',
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

// ─── Blog Post media (shared upload system — see media.service.ts's doc comment). Gated on the
// same 'cms.blog' permission as the rest of this router. ────────────────────────────────────────

router.post(
  '/:id/images',
  requirePermission('cms.blog', 'edit'),
  validateParams(UuidParamSchema),
  imageUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded.');
      const image = await blogPostService.addBlogPostImage(req.params.id, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
      });
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'blog_post_image.create',
        targetType: 'BlogPostImage',
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
  requirePermission('cms.blog', 'edit'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      await blogPostService.deleteBlogPostImage(req.params.id, req.params.imageId);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'blog_post_image.delete',
        targetType: 'BlogPostImage',
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
  requirePermission('cms.blog', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(MediaReorderSchema),
  async (req, res, next) => {
    try {
      await blogPostService.reorderBlogPostImages(req.params.id, req.body.imageIds);
      sendData(res, { reordered: true });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id/images/:imageId/primary',
  requirePermission('cms.blog', 'edit'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      await blogPostService.setBlogPostPrimaryImage(req.params.id, req.params.imageId);
      sendData(res, { primary: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
