import { Router, type Request, type RequestHandler } from 'express';
import { can } from '@skylabs-monorepo/shared-permissions';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import {
  MemberCreateSchema,
  MemberListQuerySchema,
  MemberStatusChangeSchema,
  MemberDeleteSchema,
  MemberDocumentReviewSchema,
  VendorUpdateSchema,
  VendorDocumentAdminParamSchema,
} from '../schemas/vendor.schema';
import { documentUpload } from '../lib/media-upload.middleware';
import { deprecatedAlias } from '../lib/deprecation';
import { resolveGrantedPermissionKeys } from '../services/permission-resolver.service';
import * as vendorService from '../services/vendor.service';
import * as memberDocumentService from '../services/member-document.service';
import * as memberStatusService from '../services/member-status.service';
import * as memberActivityService from '../services/member-activity.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData, ApiError } from '../lib/http';
import type { VendorDocumentType } from '../generated/prisma-client';

function meta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

/** The admin screens read step state from `profileCompletion` on every member response. */
function withCompletion<T extends Record<string, unknown>>(member: T) {
  return { ...member, profileCompletion: vendorService.computeProfileCompletion(member) };
}

/**
 * The admin member routes, built once and mounted twice: canonical at `/members`, and as a
 * deprecated alias at `/vendors` for one release so a frontend and API deployed a few minutes
 * apart keep working. Every route checks a `members:<action>` permission; none compares a role.
 */
export function buildMemberAdminRoutes(opts: { deprecated: boolean }): Router {
  const router = Router();
  const mark: RequestHandler = opts.deprecated
    ? deprecatedAlias('/api/v1/members')
    : (_req, _res, next) => next();
  // The alias also answers the old `kyc-documents` path the current admin screens call.
  const documentsPath = opts.deprecated ? ['/:id/documents', '/:id/kyc-documents'] : ['/:id/documents'];
  const documentPath = documentsPath.map((p) => `${p}/:documentType`);
  const approveGate = requirePermission('members', 'approve');
  const rejectGate = requirePermission('members', 'reject');

  router.get('/', mark, requirePermission('members', 'view'), validateQuery(MemberListQuerySchema), async (req, res, next) => {
    try {
      const { page, pageSize, search, status, documents, reviewFlag } = req.validatedQuery as ReturnType<
        typeof MemberListQuerySchema.parse
      >;
      const { items, total } = await vendorService.listVendors({ page, pageSize, search, status, documents, reviewFlag });
      sendData(res, await vendorService.attachLiveCounts(items), { meta: { total, page, pageSize } });
    } catch (err) {
      next(err);
    }
  });

  // createMember sends the welcome notice and records welcomeSentAt itself, after commit.
  router.post('/', mark, requirePermission('members', 'create'), validateBody(MemberCreateSchema), async (req, res, next) => {
    try {
      const member = await vendorService.createMember(req.body, req.user!.sub);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'member.created',
        targetType: 'Member',
        targetId: member.id,
        after: { id: member.id, businessName: member.businessName },
        ...meta(req),
      });
      sendData(res, withCompletion(member), { status: 201 });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', mark, requirePermission('members', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
    try {
      const member = await vendorService.getVendorOrThrow(req.params.id);
      const [withCounts] = await vendorService.attachLiveCounts([member]);
      sendData(res, withCompletion(withCounts));
    } catch (err) {
      next(err);
    }
  });

  router.patch(
    '/:id',
    mark,
    requirePermission('members', 'edit'),
    validateParams(UuidParamSchema),
    validateBody(VendorUpdateSchema),
    async (req, res, next) => {
      try {
        const after = await vendorService.updateVendor(req.params.id, req.body);
        await writeAuditLog({
          actorUserId: req.user!.sub,
          action: 'member.updated',
          targetType: 'Member',
          targetId: after.id,
          after,
          ...meta(req),
        });
        sendData(res, withCompletion(after));
      } catch (err) {
        next(err);
      }
    },
  );

  // Validation, history, audit and notices live in member-status.service.ts.
  router.patch(
    '/:id/status',
    mark,
    requirePermission('members', 'status_change'),
    validateParams(UuidParamSchema),
    validateBody(MemberStatusChangeSchema),
    async (req, res, next) => {
      try {
        await memberStatusService.changeMemberStatus(req.params.id, req.body.status, req.body.reason, {
          userId: req.user!.sub,
          ...meta(req),
        });
        sendData(res, await vendorService.getVendorOrThrow(req.params.id));
      } catch (err) {
        next(err);
      }
    },
  );

  // SUSPENDED members only; archives instead when order history exists. The service writes the audit row.
  router.delete(
    '/:id',
    mark,
    requirePermission('members', 'delete'),
    validateParams(UuidParamSchema),
    validateBody(MemberDeleteSchema),
    async (req, res, next) => {
      try {
        const result = await memberStatusService.deleteMember(req.params.id, req.body.reason, {
          userId: req.user!.sub,
          ...meta(req),
        });
        sendData(res, result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/:id/status-history', mark, requirePermission('members', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
    try {
      sendData(res, await memberActivityService.getStatusHistory(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/activity', mark, requirePermission('members', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
    try {
      sendData(res, await memberActivityService.getMemberActivity(req.params.id));
    } catch (err) {
      next(err);
    }
  });

  router.get(documentsPath, mark, requirePermission('members', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
    try {
      // File keys only for viewers who may open files; members:view alone sees type, masked number and status.
      const granted = await resolveGrantedPermissionKeys(req.user!.roles);
      const includeFiles = can(granted, 'members', 'edit') || can(granted, 'members', 'approve');
      sendData(res, await memberDocumentService.listMemberDocuments(req.params.id, { includeFiles }));
    } catch (err) {
      next(err);
    }
  });

  router.post(
    documentPath,
    mark,
    requirePermission('members', 'edit'),
    validateParams(VendorDocumentAdminParamSchema),
    documentUpload.single('file'),
    async (req, res, next) => {
      try {
        if (!req.file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded.');
        const document = await memberDocumentService.uploadMemberDocument({
          memberId: req.params.id,
          documentType: req.params.documentType as VendorDocumentType,
          file: { buffer: req.file.buffer, originalname: req.file.originalname },
          number: typeof req.body?.number === 'string' ? req.body.number : undefined,
          actorUserId: req.user!.sub,
          onBehalf: true,
        });
        await writeAuditLog({
          actorUserId: req.user!.sub,
          action: 'member.document.uploaded',
          targetType: 'MemberDocument',
          targetId: document.id,
          ...meta(req),
        });
        sendData(res, document, { status: 201 });
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete(
    documentPath,
    mark,
    requirePermission('members', 'edit'),
    validateParams(VendorDocumentAdminParamSchema),
    async (req, res, next) => {
      try {
        await memberDocumentService.deleteMemberDocument(req.params.id, req.params.documentType as VendorDocumentType);
        await writeAuditLog({
          actorUserId: req.user!.sub,
          action: 'member.document.deleted',
          targetType: 'MemberDocument',
          targetId: req.params.documentType,
          ...meta(req),
        });
        sendData(res, { deleted: true });
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    '/:id/documents/:documentType/review',
    mark,
    validateParams(VendorDocumentAdminParamSchema),
    validateBody(MemberDocumentReviewSchema),
    // Approve and reject are separate permissions, so the gate depends on the decision.
    (req, res, next) => (req.body.decision === 'APPROVED' ? approveGate : rejectGate)(req, res, next),
    async (req, res, next) => {
      try {
        const doc = await memberDocumentService.reviewMemberDocument({
          memberId: req.params.id,
          documentType: req.params.documentType as VendorDocumentType,
          decision: req.body.decision,
          reason: req.body.reason,
          actorUserId: req.user!.sub,
        });
        await writeAuditLog({
          actorUserId: req.user!.sub,
          action: req.body.decision === 'APPROVED' ? 'member.document.approved' : 'member.document.rejected',
          targetType: 'MemberDocument',
          targetId: doc.id,
          after: { status: doc.status },
          ...meta(req),
        });
        sendData(res, doc);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
