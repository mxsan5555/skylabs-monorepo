import { Router } from 'express';
import type { Request } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import { FaqCreateSchema, FaqUpdateSchema, FaqStatusUpdateSchema, FaqListQuerySchema } from '../schemas/faq.schema';
import * as faqService from '../services/faq.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData } from '../lib/http';

/**
 * FAQ admin CRUD — mirrors blog-posts.routes.ts's structure exactly (one router, gated on the
 * single 'cms.faq' menu key for every action), minus the media sub-routes blog posts have —
 * an FAQ answer is plain text, no cover image.
 */
const router = Router();
router.use(authenticate);

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

router.get('/', requirePermission('cms.faq', 'view'), validateQuery(FaqListQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, search } = req.validatedQuery as ReturnType<typeof FaqListQuerySchema.parse>;
    const { items, total } = await faqService.listFaqs({ page, pageSize, search });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePermission('cms.faq', 'create'), validateBody(FaqCreateSchema), async (req, res, next) => {
  try {
    const faq = await faqService.createFaq(req.body);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'faq.create',
      targetType: 'Faq',
      targetId: faq.id,
      after: faq,
      ...requestMeta(req),
    });
    sendData(res, faq, { status: 201 });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requirePermission('cms.faq', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, await faqService.getFaqOrThrow(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id',
  requirePermission('cms.faq', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(FaqUpdateSchema),
  async (req, res, next) => {
    try {
      const faq = await faqService.updateFaq(req.params.id, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'faq.update',
        targetType: 'Faq',
        targetId: faq.id,
        after: faq,
        ...requestMeta(req),
      });
      sendData(res, faq);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id/status',
  requirePermission('cms.faq', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(FaqStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const faq = await faqService.setFaqStatus(req.params.id, req.body.isActive);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'faq.status_change',
        targetType: 'Faq',
        targetId: faq.id,
        after: { isActive: faq.isActive },
        ...requestMeta(req),
      });
      sendData(res, faq);
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/:id', requirePermission('cms.faq', 'delete'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    const before = await faqService.getFaqOrThrow(req.params.id);
    await faqService.deleteFaq(req.params.id);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'faq.delete',
      targetType: 'Faq',
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
