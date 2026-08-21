import { Router } from 'express';
import type { Request } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import {
  ProductCreateSchema,
  ProductUpdateSchema,
  ProductStatusUpdateSchema,
  ProductListQuerySchema,
} from '../schemas/product.schema';
import { MediaReorderSchema } from '../schemas/media.schema';
import { imageUpload, videoUpload } from '../lib/media-upload.middleware';
import * as productService from '../services/product.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData, ApiError } from '../lib/http';

/** Standalone retail product catalog admin CRUD — gated on the existing `products` permission
 *  key (already fully seeded for admin/super_admin; vendor already has `products:view`). */
const router = Router();
router.use(authenticate);

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

router.get('/', requirePermission('products', 'view'), async (req, res, next) => {
  try {
    const { page, pageSize, search, categoryId, subcategoryId, status } = ProductListQuerySchema.parse(req.query);
    const { items, total } = await productService.listProducts({ page, pageSize, search, categoryId, subcategoryId, status });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePermission('products', 'create'), validateBody(ProductCreateSchema), async (req, res, next) => {
  try {
    const product = await productService.createProduct(req.body);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'product.create',
      targetType: 'Product',
      targetId: product.id,
      after: product,
      ...requestMeta(req),
    });
    sendData(res, product, { status: 201 });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requirePermission('products', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, await productService.getProductOrThrow(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id',
  requirePermission('products', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(ProductUpdateSchema),
  async (req, res, next) => {
    try {
      const product = await productService.updateProduct(req.params.id, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'product.update',
        targetType: 'Product',
        targetId: product.id,
        after: product,
        ...requestMeta(req),
      });
      sendData(res, product);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id/status',
  requirePermission('products', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(ProductStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const product = await productService.setProductStatus(req.params.id, req.body.isActive);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'product.status_change',
        targetType: 'Product',
        targetId: product.id,
        after: { isActive: product.isActive },
        ...requestMeta(req),
      });
      sendData(res, product);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:id',
  requirePermission('products', 'delete'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      const before = await productService.getProductOrThrow(req.params.id);
      await productService.deleteProduct(req.params.id);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'product.delete',
        targetType: 'Product',
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

// ─── Product media (shared upload system — see media.service.ts's doc comment) ──────────────

router.post(
  '/:id/images',
  requirePermission('products', 'edit'),
  validateParams(UuidParamSchema),
  imageUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded.');
      const image = await productService.addProductImage(req.params.id, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
      });
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'product_image.create',
        targetType: 'ProductImage',
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
  requirePermission('products', 'edit'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      await productService.deleteProductImage(req.params.id, req.params.imageId);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'product_image.delete',
        targetType: 'ProductImage',
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
  requirePermission('products', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(MediaReorderSchema),
  async (req, res, next) => {
    try {
      await productService.reorderProductImages(req.params.id, req.body.imageIds);
      sendData(res, { reordered: true });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id/images/:imageId/primary',
  requirePermission('products', 'edit'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      await productService.setProductPrimaryImage(req.params.id, req.params.imageId);
      sendData(res, { primary: true });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/video',
  requirePermission('products', 'edit'),
  validateParams(UuidParamSchema),
  videoUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded.');
      const video = await productService.replaceProductVideo(req.params.id, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
      });
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'product_video.upsert',
        targetType: 'ProductVideo',
        targetId: video.id,
        ...requestMeta(req),
      });
      sendData(res, video, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:id/video',
  requirePermission('products', 'edit'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      await productService.deleteProductVideo(req.params.id);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'product_video.delete',
        targetType: 'ProductVideo',
        targetId: req.params.id,
        ...requestMeta(req),
      });
      sendData(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
