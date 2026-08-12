import { Router } from 'express';
import { validateParams } from '../middleware/validate';
import { CatalogDealQuerySchema } from '../schemas/catalog.schema';
import { z } from 'zod';
import * as catalogService from '../services/catalog.service';
import { sendData } from '../lib/http';

/**
 * Public, unauthenticated customer catalogue — deliberately its own router with NO
 * `authenticate`/`requirePermission` (unlike every other route file), because this is the one
 * surface anonymous storefront visitors are meant to reach. It only ever reads through
 * `catalog.service.ts`'s explicit public field allow-lists — never the admin services, which
 * assume an already-permission-checked caller and `include` freely.
 */
const router = Router();

router.get('/categories', async (_req, res, next) => {
  try {
    sendData(res, await catalogService.getPublicCategoryTree());
  } catch (err) {
    next(err);
  }
});

router.get('/categories/:slug', validateParams(z.object({ slug: z.string().min(1) })), async (req, res, next) => {
  try {
    sendData(res, await catalogService.getPublicCategoryBySlug(req.params.slug));
  } catch (err) {
    next(err);
  }
});

router.get('/deals', async (req, res, next) => {
  try {
    const { page, pageSize, categoryId, subcategoryId, vendorId, branchId, type, search } = CatalogDealQuerySchema.parse(req.query);
    const { items, total } = await catalogService.listPublicDeals({ page, pageSize, categoryId, subcategoryId, vendorId, branchId, type, search });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.get('/deals/:id', validateParams(z.object({ id: z.string().uuid() })), async (req, res, next) => {
  try {
    sendData(res, await catalogService.getPublicDealOrThrow(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.get('/vendors/:slug', validateParams(z.object({ slug: z.string().min(1) })), async (req, res, next) => {
  try {
    sendData(res, await catalogService.getPublicVendorBySlugOrThrow(req.params.slug));
  } catch (err) {
    next(err);
  }
});

export default router;
