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

/** Reuse the same BlogPost CRUD and media behavior with independent permission surfaces. */
export function createBlogPostsRouter(permissionKey: 'cms.blog.pages' | 'cms.blog.articles' = 'cms.blog.pages') {
  const router = Router();
  router.use(authenticate);

  function requestMeta(req: Request) {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }

  router.get('/', requirePermission(permissionKey, 'view'), validateQuery(BlogPostListQuerySchema), async (req, res, next) => {
    try {
      const { page, pageSize, search, status, categoryId } = req.validatedQuery as ReturnType<typeof BlogPostListQuerySchema.parse>;
      const { items, total } = await blogPostService.listBlogPosts({ page, pageSize, search, status, categoryId });
      sendData(res, items, { meta: { total, page, pageSize } });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/',
    requirePermission(permissionKey, 'create'),
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

  router.get('/:id', requirePermission(permissionKey, 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
    try {
      sendData(res, await blogPostService.getBlogPostOrThrow(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.patch(
    '/:id',
    requirePermission(permissionKey, 'edit'),
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
    requirePermission(permissionKey, 'edit'),
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
    requirePermission(permissionKey, 'delete'),
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
  // same 'cms.blog.pages' permission as the rest of this router. ──────────────────────────────────

  router.post(
    '/:id/images',
    requirePermission(permissionKey, 'edit'),
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
    requirePermission(permissionKey, 'edit'),
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
    requirePermission(permissionKey, 'edit'),
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
    requirePermission(permissionKey, 'edit'),
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

  return router;
}

export default createBlogPostsRouter();
