import { Router } from 'express';
import type { Request } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import { SocialMediaLinkCreateSchema, SocialMediaLinkUpdateSchema, SocialMediaLinkListQuerySchema } from '../schemas/social-media.schema';
import * as socialMediaService from '../services/social-media.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData } from '../lib/http';

/**
 * Social Media Links admin CRUD — mirrors faqs.routes.ts's structure exactly (one router, gated
 * on the single 'cms.social-media' menu key for every action, no media sub-routes, no separate
 * /status route — isActive is a plain field on PATCH /:id).
 */
const router = Router();
router.use(authenticate);

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

router.get('/', requirePermission('cms.social-media', 'view'), validateQuery(SocialMediaLinkListQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, search } = req.validatedQuery as ReturnType<typeof SocialMediaLinkListQuerySchema.parse>;
    const { items, total } = await socialMediaService.listSocialMediaLinks({ page, pageSize, search });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requirePermission('cms.social-media', 'create'),
  validateBody(SocialMediaLinkCreateSchema),
  async (req, res, next) => {
    try {
      const link = await socialMediaService.createSocialMediaLink(req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'social_media_link.create',
        targetType: 'SocialMediaLink',
        targetId: link.id,
        after: link,
        ...requestMeta(req),
      });
      sendData(res, link, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/:id', requirePermission('cms.social-media', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, await socialMediaService.getSocialMediaLinkOrThrow(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id',
  requirePermission('cms.social-media', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(SocialMediaLinkUpdateSchema),
  async (req, res, next) => {
    try {
      const link = await socialMediaService.updateSocialMediaLink(req.params.id, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'social_media_link.update',
        targetType: 'SocialMediaLink',
        targetId: link.id,
        after: link,
        ...requestMeta(req),
      });
      sendData(res, link);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:id',
  requirePermission('cms.social-media', 'delete'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      const before = await socialMediaService.getSocialMediaLinkOrThrow(req.params.id);
      await socialMediaService.deleteSocialMediaLink(req.params.id);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'social_media_link.delete',
        targetType: 'SocialMediaLink',
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
