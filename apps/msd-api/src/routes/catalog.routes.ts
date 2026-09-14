import { Router } from 'express';
import { validateParams, validateQuery } from '../middleware/validate';
import { CatalogDealQuerySchema, CatalogTherapistQuerySchema, CatalogVendorQuerySchema } from '../schemas/catalog.schema';
import { PublicBlogPostListQuerySchema } from '../schemas/blog-post.schema';
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

router.get('/deals', validateQuery(CatalogDealQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, categoryId, subcategoryId, vendorId, branchId, type, search, state, city, sort, minPrice, maxPrice, latitude, longitude } =
      req.validatedQuery as ReturnType<typeof CatalogDealQuerySchema.parse>;
    const { items, total } = await catalogService.listPublicDeals({
      page,
      pageSize,
      categoryId,
      subcategoryId,
      vendorId,
      branchId,
      type,
      search,
      state,
      city,
      sort,
      minPrice,
      maxPrice,
      latitude,
      longitude,
    });
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

router.get('/locations', async (_req, res, next) => {
  try {
    sendData(res, await catalogService.listPublicLocations());
  } catch (err) {
    next(err);
  }
});

router.get('/vendors/:slug', validateParams(z.object({ slug: z.string().min(1) })), validateQuery(CatalogVendorQuerySchema), async (req, res, next) => {
  try {
    const { state, city } = req.validatedQuery as ReturnType<typeof CatalogVendorQuerySchema.parse>;
    sendData(res, await catalogService.getPublicVendorBySlugOrThrow(req.params.slug, { state, city }));
  } catch (err) {
    next(err);
  }
});

router.get('/therapists', validateQuery(CatalogTherapistQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, categoryId, subcategoryId, vendorId, branchId, search, latitude, longitude } =
      req.validatedQuery as ReturnType<typeof CatalogTherapistQuerySchema.parse>;
    const { items, total } = await catalogService.listPublicTherapists({ page, pageSize, categoryId, subcategoryId, vendorId, branchId, search, latitude, longitude });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.get('/therapists/:id', validateParams(z.object({ id: z.string().uuid() })), async (req, res, next) => {
  try {
    sendData(res, await catalogService.getPublicTherapistOrThrow(req.params.id));
  } catch (err) {
    next(err);
  }
});

// ─── CMS (Blog Posts / About Us / Contact Us) — same "no authenticate/requirePermission, only
// ever reads through explicit public functions" discipline as every other route in this file
// (see the module doc comment above). ────────────────────────────────────────────────────────

router.get('/blog-posts', validateQuery(PublicBlogPostListQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, search, categorySlug } = req.validatedQuery as ReturnType<typeof PublicBlogPostListQuerySchema.parse>;
    const { items, total } = await catalogService.listPublicBlogPosts({ page, pageSize, search, categorySlug });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.get('/blog-posts/:slug', validateParams(z.object({ slug: z.string().min(1) })), async (req, res, next) => {
  try {
    sendData(res, await catalogService.getPublicBlogPostBySlug(req.params.slug));
  } catch (err) {
    next(err);
  }
});

router.get('/about-us', async (_req, res, next) => {
  try {
    sendData(res, await catalogService.getPublicAboutUs());
  } catch (err) {
    next(err);
  }
});

router.get('/contact-us', async (_req, res, next) => {
  try {
    sendData(res, await catalogService.getPublicContactUs());
  } catch (err) {
    next(err);
  }
});

export default router;
