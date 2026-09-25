import { Router } from 'express';
import type { Request } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import {
  HomeHeroSlideCreateSchema,
  HomeHeroSlideUpdateSchema,
  HomeHeroSlideStatusUpdateSchema,
  HomeHeroSlideListQuerySchema,
} from '../schemas/home-hero.schema';
import * as homeHeroService from '../services/home-hero.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData } from '../lib/http';

/** Home page "Home Hero" (state-wise Deal slider) admin CRUD — gated on `masters.home-hero`,
 *  mirroring `promotions.routes.ts`'s exact shape. No media sub-routes — a slide's image is
 *  always its linked Deal's own image, never a separately uploaded one (see `HomeHeroSlide`'s
 *  schema doc comment). */
const router = Router();
router.use(authenticate);

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

// A query string can't carry a literal `null`, so the Global/Default slider (DB `state: null`)
// is requested as the sentinel `state=__global__` — distinct from omitting `state` entirely
// (which means "every state, unfiltered admin list"). See `home-hero.service.ts#listSlides`'s own
// 3-way `undefined`/`null`/string handling.
router.get('/slides', requirePermission('masters.home-hero', 'view'), validateQuery(HomeHeroSlideListQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, state } = req.validatedQuery as ReturnType<typeof HomeHeroSlideListQuerySchema.parse>;
    const stateFilter = state === undefined ? undefined : state === '__global__' ? null : state;
    const { items, total } = await homeHeroService.listSlides({ page, pageSize, state: stateFilter });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.get('/states', requirePermission('masters.home-hero', 'view'), async (_req, res, next) => {
  try {
    sendData(res, await homeHeroService.listConfiguredStates());
  } catch (err) {
    next(err);
  }
});

router.get('/eligible-count', requirePermission('masters.home-hero', 'view'), async (req, res, next) => {
  try {
    const rawState = typeof req.query.state === 'string' ? req.query.state : '';
    const state = rawState.length > 0 && rawState !== '__global__' ? rawState : null;
    const count = await homeHeroService.countEligibleSlides(state);
    sendData(res, { state, eligibleCount: count, minimumRequired: homeHeroService.MIN_ELIGIBLE_SLIDES });
  } catch (err) {
    next(err);
  }
});

router.post('/slides', requirePermission('masters.home-hero', 'create'), validateBody(HomeHeroSlideCreateSchema), async (req, res, next) => {
  try {
    const slide = await homeHeroService.createSlide(req.body);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'home_hero_slide.create',
      targetType: 'HomeHeroSlide',
      targetId: slide.id,
      after: slide,
      ...requestMeta(req),
    });
    sendData(res, slide, { status: 201 });
  } catch (err) {
    next(err);
  }
});

router.get('/slides/:id', requirePermission('masters.home-hero', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, await homeHeroService.getSlideOrThrow(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/slides/:id',
  requirePermission('masters.home-hero', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(HomeHeroSlideUpdateSchema),
  async (req, res, next) => {
    try {
      const slide = await homeHeroService.updateSlide(req.params.id, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'home_hero_slide.update',
        targetType: 'HomeHeroSlide',
        targetId: slide.id,
        after: slide,
        ...requestMeta(req),
      });
      sendData(res, slide);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/slides/:id/status',
  requirePermission('masters.home-hero', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(HomeHeroSlideStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const slide = await homeHeroService.setSlideStatus(req.params.id, req.body.isActive);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'home_hero_slide.status_change',
        targetType: 'HomeHeroSlide',
        targetId: slide.id,
        after: { isActive: slide.isActive },
        ...requestMeta(req),
      });
      sendData(res, slide);
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/slides/:id', requirePermission('masters.home-hero', 'delete'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    const before = await homeHeroService.getSlideOrThrow(req.params.id);
    await homeHeroService.deleteSlide(req.params.id);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'home_hero_slide.delete',
      targetType: 'HomeHeroSlide',
      targetId: req.params.id,
      before,
      ...requestMeta(req),
    });
    sendData(res, null);
  } catch (err) {
    next(err);
  }
});

export default router;
