import { Router } from 'express';
import type { Request } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import {
  HowItWorksContentUpdateSchema,
  HowItWorksStepCreateSchema,
  HowItWorksStepUpdateSchema,
  HowItWorksStepReorderSchema,
} from '../schemas/how-it-works.schema';
import * as howItWorksService from '../services/how-it-works.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData } from '../lib/http';

/**
 * How It Works admin content — a singleton hero row (`GET/PATCH /how-it-works`, no `:id`, same
 * convention as site-content.routes.ts's About Us) plus a flat, reorderable list of numbered
 * steps under `/how-it-works/steps`. Mounted at `/how-it-works` in app.ts, so every path below is
 * relative to that prefix. Every route is gated on the single 'cms.how-it-works' menu key.
 */
const router = Router();
router.use(authenticate);

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

// ─── Hero content (singleton) ────────────────────────────────────────────────

router.get('/', requirePermission('cms.how-it-works', 'view'), async (_req, res, next) => {
  try {
    sendData(res, await howItWorksService.getHowItWorksContent());
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/',
  requirePermission('cms.how-it-works', 'edit'),
  validateBody(HowItWorksContentUpdateSchema),
  async (req, res, next) => {
    try {
      const content = await howItWorksService.updateHowItWorksContent(req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'how_it_works_content.update',
        targetType: 'HowItWorksContent',
        targetId: content.id,
        after: content,
        ...requestMeta(req),
      });
      sendData(res, content);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Steps ────────────────────────────────────────────────────────────────────

router.get('/steps', requirePermission('cms.how-it-works', 'view'), async (_req, res, next) => {
  try {
    sendData(res, await howItWorksService.listHowItWorksSteps());
  } catch (err) {
    next(err);
  }
});

router.post(
  '/steps',
  requirePermission('cms.how-it-works', 'create'),
  validateBody(HowItWorksStepCreateSchema),
  async (req, res, next) => {
    try {
      const step = await howItWorksService.createHowItWorksStep(req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'how_it_works_step.create',
        targetType: 'HowItWorksStep',
        targetId: step.id,
        after: step,
        ...requestMeta(req),
      });
      sendData(res, step, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

// Registered before '/steps/:id' — Express matches routes in order, and PATCH '/steps/reorder'
// would otherwise be swallowed by PATCH '/steps/:id' with id="reorder".
router.patch(
  '/steps/reorder',
  requirePermission('cms.how-it-works', 'edit'),
  validateBody(HowItWorksStepReorderSchema),
  async (req, res, next) => {
    try {
      await howItWorksService.reorderHowItWorksSteps(req.body.stepIds);
      sendData(res, { reordered: true });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/steps/:id',
  requirePermission('cms.how-it-works', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(HowItWorksStepUpdateSchema),
  async (req, res, next) => {
    try {
      const step = await howItWorksService.updateHowItWorksStep(req.params.id, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'how_it_works_step.update',
        targetType: 'HowItWorksStep',
        targetId: step.id,
        after: step,
        ...requestMeta(req),
      });
      sendData(res, step);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/steps/:id',
  requirePermission('cms.how-it-works', 'delete'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      const before = await howItWorksService.getHowItWorksStepOrThrow(req.params.id);
      await howItWorksService.deleteHowItWorksStep(req.params.id);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'how_it_works_step.delete',
        targetType: 'HowItWorksStep',
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
