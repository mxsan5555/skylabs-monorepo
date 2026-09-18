import { Router } from 'express';
import type { Request } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import { WebsitePageUpdateSchema, WebsitePageListQuerySchema } from '../schemas/website-page.schema';
import * as websitePageService from '../services/website-page.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData } from '../lib/http';

/**
 * Legal/website pages admin — `GET /`, `GET /:id`, `PATCH /:id` only. Unlike every other CMS
 * resource in this module there is deliberately no `POST`/`DELETE` route: the 4 rows (Privacy
 * Policy/Terms of Service/Accessibility/Cookie Policy) are fixed, seeded once by the
 * `add_cms_content_types` migration, and only ever edited in place — same "no create/delete
 * concept for a row that always exists" discipline as site-content.routes.ts's About Us/
 * Contact Us singletons, just with 4 fixed rows instead of 1. Gated on 'cms.website-pages',
 * which only ever has 'view'/'edit' actions (see seed.ts's EXTRA_ACTIONS_BY_MENU_KEY).
 */
const router = Router();
router.use(authenticate);

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

router.get('/', requirePermission('cms.website-pages', 'view'), validateQuery(WebsitePageListQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, search } = req.validatedQuery as ReturnType<typeof WebsitePageListQuerySchema.parse>;
    const { items, total } = await websitePageService.listWebsitePages({ page, pageSize, search });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requirePermission('cms.website-pages', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, await websitePageService.getWebsitePageOrThrow(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id',
  requirePermission('cms.website-pages', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(WebsitePageUpdateSchema),
  async (req, res, next) => {
    try {
      const page = await websitePageService.updateWebsitePage(req.params.id, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'website_page.update',
        targetType: 'WebsitePage',
        targetId: page.id,
        after: page,
        ...requestMeta(req),
      });
      sendData(res, page);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
