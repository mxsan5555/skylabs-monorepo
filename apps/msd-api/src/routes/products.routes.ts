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
 * Cross-vendor oversight surface — but unlike Branches/Deals/Therapists' equivalent
 * (`GET /vendors/branches|deals|therapists`, gated on the admin-only `vendors:view`, which the
 * `vendor` role never holds — see seed.ts), this router is gated on plain `products:view`, which
 * the `vendor` role DOES hold (it needs that same permission key for its own self-service
 * `/vendors/me/products`). So a client-supplied `?vendorId=` here can't be trusted the way it can
 * be for an admin-only route — a Vendor caller must always be force-scoped to their own vendor,
 * exactly like `order.service.ts#listOrders`/`getOrderOrThrow` already force-scope Orders via
 * `getVendorByOwnerUserId`. Create/update/delete/media stay vendor-scoped only, split self-service
 * (`/vendors/me/products`) vs admin-on-behalf (`/vendors/:id/products`) in vendors.routes.ts.
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
