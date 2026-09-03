import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateParams, validateQuery } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import { ProductListQuerySchema } from '../schemas/product.schema';
import * as productService from '../services/product.service';
import { sendData } from '../lib/http';

/**
 * Superadmin, cross-vendor, READ-ONLY oversight list — Product is now a vendor-owned entity
 * (see the `direct_category_access` migration); create/update/delete/media are vendor-scoped
 * only, split self-service (`/vendors/me/products`) vs admin-on-behalf (`/vendors/:id/products`)
 * in vendors.routes.ts, mirroring how Branches/Deals/Therapists are already split there.
 */
const router = Router();
router.use(authenticate);

router.get('/', requirePermission('products', 'view'), validateQuery(ProductListQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, search, vendorId, categoryId, subcategoryId, status } = req.validatedQuery as ReturnType<typeof ProductListQuerySchema.parse>;
    const { items, total } = await productService.listProducts({ page, pageSize, search, vendorId, categoryId, subcategoryId, status });
    sendData(res, items, { meta: { total, page, pageSize } });
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

export default router;
