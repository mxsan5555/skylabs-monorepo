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
import * as productService from '../services/product.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData } from '../lib/http';

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

export default router;
