import { Router } from 'express';
import { validateParams, validateQuery } from '../middleware/validate';
import { CatalogDealQuerySchema, CatalogDealFacetQuerySchema, CatalogProductQuerySchema, CatalogTherapistQuerySchema, CatalogVendorQuerySchema, splitIds, CatalogProductFacetQuerySchema, CatalogTherapistFacetQuerySchema, splitTags } from '../schemas/catalog.schema';
import { PublicBlogPostListQuerySchema } from '../schemas/blog-post.schema';
import { z } from 'zod';
import * as catalogService from '../services/catalog.service';
// Called directly (not through catalog.service.ts) — see catalog.service.ts's own doc comment
// on why Home Hero's public read is the one deliberate exception to this file's usual pattern.
import { getPublicHomeHero } from '../services/home-hero.service';
import { PublicHomeHeroQuerySchema } from '../schemas/home-hero.schema';
import { getPublicHomeTagSections } from '../services/home-tag-section.service';
import { PublicHomeTagSectionsQuerySchema } from '../schemas/home-tag-section.schema';
import { PublicBannerQuerySchema } from '../schemas/promotion.schema';
import { getPublicBanners } from '../services/promotion.service';
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

router.get('/popular-treatments', async (_req, res, next) => {
  try {
    sendData(res, await catalogService.getPublicPopularTreatments());
  } catch (err) {
    next(err);
  }
});

/** CTA banners for one slot and the visitor's state, else Global/Default (PLANNING §6). */
router.get('/banners', validateQuery(PublicBannerQuerySchema), async (req, res, next) => {
  try {
    const { slot, state } = req.validatedQuery as ReturnType<typeof PublicBannerQuerySchema.parse>;
    sendData(res, await getPublicBanners({ slot, state: state || null }));
  } catch (err) {
    next(err);
  }
});

/** Deprecated for one release: the Global/Default banners of `HOME_AFTER_DEALS` (use /banners). */
router.get('/promotions', async (_req, res, next) => {
  try {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Link', '</api/v1/catalog/banners?slot=HOME_AFTER_DEALS>; rel="successor-version"');
    sendData(res, await getPublicBanners({ slot: 'HOME_AFTER_DEALS', state: null }));
  } catch (err) {
    next(err);
  }
});

router.get('/home-hero', validateQuery(PublicHomeHeroQuerySchema), async (req, res, next) => {
  try {
    const { state } = req.validatedQuery as ReturnType<typeof PublicHomeHeroQuerySchema.parse>;
    sendData(res, await getPublicHomeHero(state));
  } catch (err) {
    next(err);
  }
});

/** The New/Deal/Hot Deal/Expire soon rails for the visitor's state, each falling back to
 *  Global/Default independently (PLANNING.md §7.1). */
router.get('/home-tag-sections', validateQuery(PublicHomeTagSectionsQuerySchema), async (req, res, next) => {
  try {
    const { state } = req.validatedQuery as ReturnType<typeof PublicHomeTagSectionsQuerySchema.parse>;
    sendData(res, await getPublicHomeTagSections(state));
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
    const { page, pageSize, categoryId, subcategoryId, vendorId, branchId, vendorIds, branchIds, search, state, city, sort, minPrice, maxPrice, radiusKm, latitude, longitude, tags } =
      req.validatedQuery as ReturnType<typeof CatalogDealQuerySchema.parse>;
    const { items, total } = await catalogService.listPublicDeals({
      page,
      pageSize,
      categoryId,
      subcategoryId,
      vendorId,
      branchId,
      vendorIds: splitIds(vendorIds),
      branchIds: splitIds(branchIds),
      search,
      state,
      city,
      sort,
      minPrice,
      maxPrice,
      radiusKm,
      latitude,
      longitude,
      tags: splitTags(tags),
    });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

// Registered BEFORE `/deals/:id` — Express matches routes in registration order, and `:id` is a
// UUID-validated param, so `/deals/facets` must come first or it would 422 as an invalid UUID.
router.get('/deals/facets', validateQuery(CatalogDealFacetQuerySchema), async (req, res, next) => {
  try {
    const { categoryId, subcategoryId, vendorIds, branchIds, search, state, city, minPrice, maxPrice, radiusKm, latitude, longitude, tags } =
      req.validatedQuery as ReturnType<typeof CatalogDealFacetQuerySchema.parse>;
    sendData(
      res,
      await catalogService.getPublicDealFacets({
        categoryId,
        subcategoryId,
        search,
        state,
        city,
        vendorIds: splitIds(vendorIds),
        branchIds: splitIds(branchIds),
        minPrice,
        maxPrice,
        radiusKm,
        latitude,
        longitude,
        tags: splitTags(tags),
      }),
    );
  } catch (err) {
    next(err);
  }
});

/** A UUID, the current slug or an old slug (PLANNING §2.7 URLs). */
const DealIdOrSlugParamSchema = z.object({ id: z.string().min(1).max(160).regex(/^[A-Za-z0-9-]+$/) });

router.get('/deals/:id', validateParams(DealIdOrSlugParamSchema), async (req, res, next) => {
  try {
    sendData(res, await catalogService.getPublicDealOrThrow(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.get('/products', validateQuery(CatalogProductQuerySchema), async (req, res, next) => {
  try {
    const { categoryIds, tags, ...query } = req.validatedQuery as ReturnType<typeof CatalogProductQuerySchema.parse>;
    const { items, total } = await catalogService.listPublicProducts({ ...query, categoryIds: splitIds(categoryIds), tags: splitTags(tags) });
    sendData(res, items, { meta: { total, page: query.page, pageSize: query.pageSize } });
  } catch (err) {
    next(err);
  }
});

// Before `/products/:id` (UUID-validated), same as `/deals/facets`.
router.get('/products/facets', validateQuery(CatalogProductFacetQuerySchema), async (req, res, next) => {
  try {
    const { categoryIds, tags, ...query } = req.validatedQuery as ReturnType<typeof CatalogProductFacetQuerySchema.parse>;
    sendData(res, await catalogService.getPublicProductFacets({ ...query, categoryIds: splitIds(categoryIds), tags: splitTags(tags) }));
  } catch (err) {
    next(err);
  }
});


router.get('/products/:id', validateParams(z.object({ id: z.string().min(1) })), async (req, res, next) => {
  try {
    sendData(res, await catalogService.getPublicProductOrThrow(req.params.id));
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
    const { vendorIds, branchIds, ...query } = req.validatedQuery as ReturnType<typeof CatalogTherapistQuerySchema.parse>;
    const { items, total } = await catalogService.listPublicTherapists({ ...query, vendorIds: splitIds(vendorIds), branchIds: splitIds(branchIds) });
    sendData(res, items, { meta: { total, page: query.page, pageSize: query.pageSize } });
  } catch (err) {
    next(err);
  }
});

// Before `/therapists/:id` (UUID-validated), same as `/deals/facets`.
router.get('/therapists/facets', validateQuery(CatalogTherapistFacetQuerySchema), async (req, res, next) => {
  try {
    const { vendorIds, branchIds, ...query } = req.validatedQuery as ReturnType<typeof CatalogTherapistFacetQuerySchema.parse>;
    sendData(res, await catalogService.getPublicTherapistFacets({ ...query, vendorIds: splitIds(vendorIds), branchIds: splitIds(branchIds) }));
  } catch (err) {
    next(err);
  }
});

router.get('/therapists/:id', validateParams(z.object({ id: z.string().min(1) })), async (req, res, next) => {
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

router.get('/faqs', async (_req, res, next) => {
  try {
    sendData(res, await catalogService.listPublicFaqs());
  } catch (err) {
    next(err);
  }
});

router.get('/blog-categories', async (_req, res, next) => {
  try {
    sendData(res, await catalogService.listPublicBlogCategories());
  } catch (err) {
    next(err);
  }
});

router.get('/pages/:slug', validateParams(z.object({ slug: z.string().min(1) })), async (req, res, next) => {
  try {
    sendData(res, await catalogService.getPublicWebsitePageBySlug(req.params.slug));
  } catch (err) {
    next(err);
  }
});

router.get('/how-it-works', async (_req, res, next) => {
  try {
    sendData(res, await catalogService.getPublicHowItWorks());
  } catch (err) {
    next(err);
  }
});

router.get('/careers', async (_req, res, next) => {
  try {
    sendData(res, await catalogService.getPublicCareers());
  } catch (err) {
    next(err);
  }
});

router.get('/social-links', async (_req, res, next) => {
  try {
    sendData(res, await catalogService.listPublicSocialMediaLinks());
  } catch (err) {
    next(err);
  }
});

export default router;
