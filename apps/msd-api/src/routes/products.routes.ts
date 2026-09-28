import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateParams, validateQuery } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import { ProductListQuerySchema } from '../schemas/product.schema';
import * as productService from '../services/product.service';
import * as vendorService from '../services/vendor.service';
import { sendData } from '../lib/http';

/**
 * Cross-vendor oversight surface, gated on plain `products:view` — currently only admin/staff
 * roles hold that key (the `vendor` role's own self-service reads/writes go through
 * `/vendors/me/products*`, gated `vendors:custom` instead — see vendors.routes.ts). Still,
 * a caller who happens to own a Vendor profile is force-scoped to it regardless of any
 * `?vendorId=` supplied, exactly like `order.service.ts#listOrders`/`getOrderOrThrow` force-scope
 * Orders via `getVendorByOwnerUserId` — belt-and-suspenders in case `products:view` is ever
 * granted more broadly later. Create/update/delete/media stay vendor-scoped only, split
 * self-service (`/vendors/me/products`, `vendors:custom`) vs admin-on-behalf
 * (`/vendors/:id/products`, `vendors:*`) in vendors.routes.ts.
 */
const router = Router();
router.use(authenticate);

router.get('/', requirePermission('products', 'view'), validateQuery(ProductListQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, search, vendorId, categoryId, subcategoryId, status } = req.validatedQuery as ReturnType<typeof ProductListQuerySchema.parse>;
    // A caller who owns a Vendor profile is ALWAYS force-scoped to it — never the optional
    // `vendorId` query param, which only a caller with no Vendor profile (admin/staff) can use to
    // drill into one vendor's products. Mirrors order.service.ts#listOrders exactly.
    const vendor = await vendorService.getVendorByOwnerUserId(req.user!.sub);
    const scopedVendorId = vendor ? vendor.id : vendorId;
    const { items, total } = await productService.listProducts({ page, pageSize, search, vendorId: scopedVendorId, categoryId, subcategoryId, status });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requirePermission('products', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    // Same "a different vendor's row 404s, never confirming existence" discipline this app
    // already applies everywhere else (getBranchScopedOrThrow/getDealScopedOrThrow/
    // getTherapistScopedOrThrow/getOrderOrThrow) — here via the existing
    // getProductScopedOrThrow, reused rather than duplicated.
    const vendor = await vendorService.getVendorByOwnerUserId(req.user!.sub);
    const product = vendor
      ? await productService.getProductScopedOrThrow(vendor.id, req.params.id)
      : await productService.getProductOrThrow(req.params.id);
    sendData(res, product);
  } catch (err) {
    next(err);
  }
});

export default router;
