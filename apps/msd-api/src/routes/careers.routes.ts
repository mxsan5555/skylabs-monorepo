import { Router } from 'express';
import type { Request } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import {
  CareersPageContentUpdateSchema,
  CareersJobListQuerySchema,
  CareersJobListingCreateSchema,
  CareersJobListingUpdateSchema,
  CareersJobListingStatusUpdateSchema,
} from '../schemas/careers.schema';
import * as careersService from '../services/careers.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData } from '../lib/http';

/**
 * Careers admin content — a singleton hero row (`GET/PATCH /careers`, no `:id`, same convention
 * as site-content.routes.ts's About Us) plus full CRUD for job listings under `/careers/jobs`.
 * Mounted at `/careers` in app.ts, so every path below is relative to that prefix. Every route is
 * gated on the single 'cms.careers' menu key.
 */
const router = Router();
router.use(authenticate);

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

// ─── Hero content (singleton) ────────────────────────────────────────────────

router.get('/', requirePermission('cms.careers', 'view'), async (_req, res, next) => {
  try {
    sendData(res, await careersService.getCareersPageContent());
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/',
  requirePermission('cms.careers', 'edit'),
  validateBody(CareersPageContentUpdateSchema),
  async (req, res, next) => {
    try {
      const content = await careersService.updateCareersPageContent(req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'careers_page_content.update',
        targetType: 'CareersPageContent',
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

// ─── Job listings ─────────────────────────────────────────────────────────────

router.get('/jobs', requirePermission('cms.careers', 'view'), validateQuery(CareersJobListQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, search, status } = req.validatedQuery as ReturnType<typeof CareersJobListQuerySchema.parse>;
    const { items, total } = await careersService.listCareersJobListings({ page, pageSize, search, status });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/jobs',
  requirePermission('cms.careers', 'create'),
  validateBody(CareersJobListingCreateSchema),
  async (req, res, next) => {
    try {
      const job = await careersService.createCareersJobListing(req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'careers_job_listing.create',
        targetType: 'CareersJobListing',
        targetId: job.id,
        after: job,
        ...requestMeta(req),
      });
      sendData(res, job, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/jobs/:id', requirePermission('cms.careers', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, await careersService.getCareersJobListingOrThrow(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/jobs/:id',
  requirePermission('cms.careers', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(CareersJobListingUpdateSchema),
  async (req, res, next) => {
    try {
      const job = await careersService.updateCareersJobListing(req.params.id, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'careers_job_listing.update',
        targetType: 'CareersJobListing',
        targetId: job.id,
        after: job,
        ...requestMeta(req),
      });
      sendData(res, job);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/jobs/:id/status',
  requirePermission('cms.careers', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(CareersJobListingStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const job = await careersService.setCareersJobListingStatus(req.params.id, req.body.status);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'careers_job_listing.status_change',
        targetType: 'CareersJobListing',
        targetId: job.id,
        after: { status: job.status },
        ...requestMeta(req),
      });
      sendData(res, job);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/jobs/:id',
  requirePermission('cms.careers', 'delete'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      const before = await careersService.getCareersJobListingOrThrow(req.params.id);
      await careersService.deleteCareersJobListing(req.params.id);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'careers_job_listing.delete',
        targetType: 'CareersJobListing',
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
