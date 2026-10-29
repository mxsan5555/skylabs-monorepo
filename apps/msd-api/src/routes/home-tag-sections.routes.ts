import { Router } from 'express';
import type { Request } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import {
  HomeTagSectionsQuerySchema,
  HomeTagSectionEnableSchema,
  HomeTagSectionItemCreateSchema,
  HomeTagSectionItemReorderSchema,
} from '../schemas/home-tag-section.schema';
import { StateItemSearchQuerySchema } from '../schemas/home-hero.schema';
import * as homeTagSectionService from '../services/home-tag-section.service';
import { searchStateItems } from '../services/state-catalog.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData } from '../lib/http';

/** Home page "Home Tag Sections" (New/Deal/Hot Deal/Expire soon rails, docs/msd/PLANNING.md §7.1)
 *  admin CRUD — gated on `masters.home-tag-sections`, mirroring `home-hero.routes.ts`'s exact
 *  shape. Deals only (no product/type toggle) — a section's items are manually picked, never a
 *  separately uploaded snapshot. */
const router = Router();
router.use(authenticate);

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

// Same `__global__` sentinel as `home-hero.routes.ts` — a query string can't carry a literal `null`.
function stateFromQuery(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 && raw !== '__global__' ? raw : null;
}

router.get('/search-items', requirePermission('masters.home-tag-sections', 'view'), validateQuery(StateItemSearchQuerySchema), async (req, res, next) => {
  try {
    const { state, q, pageSize, eligibleOnly } = req.validatedQuery as ReturnType<typeof StateItemSearchQuerySchema.parse>;
    sendData(res, await searchStateItems({ state: state || null, q: q ?? '', type: 'deal', pageSize, eligibleOnly }));
  } catch (err) {
    next(err);
  }
});

/** One row per state for the overview table, Global/Default first. */
router.get('/overview', requirePermission('masters.home-tag-sections', 'view'), async (_req, res, next) => {
  try {
    sendData(res, await homeTagSectionService.listOverview());
  } catch (err) {
    next(err);
  }
});

router.get('/states', requirePermission('masters.home-tag-sections', 'view'), async (_req, res, next) => {
  try {
    sendData(res, await homeTagSectionService.listConfiguredStates());
  } catch (err) {
    next(err);
  }
});

/** The 4 fixed tag rows for one state (or Global/Default), always all 4. */
router.get('/sections', requirePermission('masters.home-tag-sections', 'view'), validateQuery(HomeTagSectionsQuerySchema), async (req, res, next) => {
  try {
    const { state } = req.validatedQuery as ReturnType<typeof HomeTagSectionsQuerySchema.parse>;
    sendData(res, await homeTagSectionService.getSectionsForState(stateFromQuery(state)));
  } catch (err) {
    next(err);
  }
});

router.put('/sections', requirePermission('masters.home-tag-sections', 'edit'), validateBody(HomeTagSectionEnableSchema), async (req, res, next) => {
  try {
    const { state, tag, isEnabled } = req.body as ReturnType<typeof HomeTagSectionEnableSchema.parse>;
    const section = await homeTagSectionService.setSectionEnabled(state, tag, isEnabled);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'home_tag_section.status_change',
      targetType: 'HomeTagSection',
      targetId: section.id,
      after: { state, tag, isEnabled },
      ...requestMeta(req),
    });
    sendData(res, section);
  } catch (err) {
    next(err);
  }
});

router.get('/sections/:id/items', requirePermission('masters.home-tag-sections', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, await homeTagSectionService.listItems(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/sections/:id/items',
  requirePermission('masters.home-tag-sections', 'create'),
  validateParams(UuidParamSchema),
  validateBody(HomeTagSectionItemCreateSchema),
  async (req, res, next) => {
    try {
      const item = await homeTagSectionService.addItem(req.params.id, req.body.dealId);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'home_tag_section_item.create',
        targetType: 'HomeTagSectionItem',
        targetId: item.id,
        after: item,
        ...requestMeta(req),
      });
      sendData(res, item, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/sections/:id/items/order',
  requirePermission('masters.home-tag-sections', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(HomeTagSectionItemReorderSchema),
  async (req, res, next) => {
    try {
      await homeTagSectionService.reorderItems(req.params.id, req.body.itemIds);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'home_tag_section_item.reorder',
        targetType: 'HomeTagSection',
        targetId: req.params.id,
        after: { itemIds: req.body.itemIds },
        ...requestMeta(req),
      });
      sendData(res, { reordered: true });
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/items/:id', requirePermission('masters.home-tag-sections', 'delete'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    await homeTagSectionService.removeItem(req.params.id);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'home_tag_section_item.delete',
      targetType: 'HomeTagSectionItem',
      targetId: req.params.id,
      ...requestMeta(req),
    });
    sendData(res, null);
  } catch (err) {
    next(err);
  }
});

export default router;
