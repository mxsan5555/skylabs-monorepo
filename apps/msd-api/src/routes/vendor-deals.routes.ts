import type { Request, RequestHandler, Router } from 'express';
import {
  DealCreateSchema,
  DealUpdateSchema,
  DealStatusUpdateSchema,
  DealCopySchema,
  DealImageUpdateSchema,
  DealPackageCreateSchema,
  DealPackageUpdateSchema,
  DealPackageReorderSchema,
} from '../schemas/vendor.schema';
import { MediaReorderSchema } from '../schemas/media.schema';
import { imageUpload, videoUpload } from '../lib/media-upload.middleware';
import { validateBody } from '../middleware/validate';
import { requirePermission } from '../middleware/requirePermission';
import * as dealService from '../services/deal.service';
import { getMyVendorOrThrow } from '../services/vendor.service';
import { isSuperAdminUser } from '../services/super-admin-guard.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData, ApiError } from '../lib/http';

/**
 * Deal routes (docs/msd/API.md §2, §2.2), registered twice on the vendors router with the same
 * handlers:
 * - `member`: `/me/...`, the signed-in member's own deals (`members:custom`).
 * - `staff`: `/:vendorId/...`, staff working for a member (`vendors.deals:<action>`); delete is
 *   Super Admin only on top of the permission (PLANNING §2.7).
 */

type Action = 'view' | 'create' | 'edit' | 'delete' | 'status_change';

interface Surface {
  prefix: string;
  guard: (action: Action) => RequestHandler;
  vendorIdOf: (req: Request) => Promise<string>;
  actorIsStaff: boolean;
}

export const memberDealSurface: Surface = {
  prefix: '/me',
  guard: () => requirePermission('members', 'custom'),
  vendorIdOf: async (req) => (await getMyVendorOrThrow(req.user!.sub)).id,
  actorIsStaff: false,
};

export const staffDealSurface: Surface = {
  prefix: '/:vendorId',
  guard: (action) => requirePermission('vendors.deals', action),
  vendorIdOf: async (req) => req.params.vendorId,
  actorIsStaff: true,
};

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

type Ctx = { vendorId: string; branchId: string; dealId: string; packageId: string; imageId: string };

export function registerDealRoutes(router: Router, surface: Surface) {
  const deal = `${surface.prefix}/branches/:branchId/deals/:dealId`;

  /** Resolves the member, runs `work`, writes the audit row for writes and sends the result. */
  const handle =
    (work: (ctx: Ctx, req: Request) => Promise<unknown>, audit?: { action: string; targetType: string; status?: number }) =>
    (async (req, res, next) => {
      try {
        const ctx: Ctx = {
          vendorId: await surface.vendorIdOf(req),
          branchId: req.params.branchId,
          dealId: req.params.dealId,
          packageId: req.params.packageId,
          imageId: req.params.imageId,
        };
        const result = await work(ctx, req);
        if (audit) {
          const target = result as { id?: string } | null;
          await writeAuditLog({
            actorUserId: req.user!.sub,
            action: audit.action,
            targetType: audit.targetType,
            targetId: ctx.packageId ?? ctx.imageId ?? target?.id ?? ctx.dealId,
            after: result ?? undefined,
            ...requestMeta(req),
          });
        }
        sendData(res, result, { status: audit?.status });
      } catch (err) {
        next(err);
      }
    }) as RequestHandler;

  const upload = (file: Express.Multer.File | undefined) => {
    if (!file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded.');
    return { buffer: file.buffer, originalname: file.originalname };
  };

  // Reads
  router.get(`${surface.prefix}/deals`, surface.guard('view'), handle((c) => dealService.listMemberDeals(c.vendorId)));
  router.get(`${surface.prefix}/branches/:branchId/deals`, surface.guard('view'), handle((c) => dealService.listDeals(c.vendorId, c.branchId)));
  router.get(deal, surface.guard('view'), handle((c) => dealService.getDeal(c.vendorId, c.branchId, c.dealId)));

  // Deal
  router.post(
    `${surface.prefix}/branches/:branchId/deals`,
    surface.guard('create'),
    validateBody(DealCreateSchema),
    handle((c, req) => dealService.createDeal(c.vendorId, c.branchId, req.body), { action: 'deal.create', targetType: 'Deal', status: 201 }),
  );
  router.patch(
    deal,
    surface.guard('edit'),
    validateBody(DealUpdateSchema),
    handle((c, req) => dealService.updateDeal(c.vendorId, c.branchId, c.dealId, req.body, { actorIsStaff: surface.actorIsStaff }), {
      action: 'deal.update',
      targetType: 'Deal',
    }),
  );
  router.patch(
    `${deal}/status`,
    surface.guard('status_change'),
    validateBody(DealStatusUpdateSchema),
    handle((c, req) => dealService.setDealStatus(c.vendorId, c.branchId, c.dealId, req.body.status), {
      action: 'deal.status_change',
      targetType: 'Deal',
    }),
  );
  router.post(
    `${deal}/copy`,
    surface.guard('create'),
    validateBody(DealCopySchema),
    handle((c, req) => dealService.copyDeal(c.vendorId, c.branchId, c.dealId, req.body.branchId), {
      action: 'deal.copy',
      targetType: 'Deal',
      status: 201,
    }),
  );
  if (surface.actorIsStaff) {
    router.delete(
      deal,
      surface.guard('delete'),
      handle(
        async (c, req) => {
          if (!(await isSuperAdminUser(req.user!.sub))) throw new ApiError('FORBIDDEN', 'Only a Super Admin can delete a deal');
          await dealService.deleteDeal(c.vendorId, c.branchId, c.dealId);
          return null;
        },
        { action: 'deal.delete', targetType: 'Deal' },
      ),
    );
  }

  // Packages (static `reorder` before `:packageId`)
  router.post(
    `${deal}/packages`,
    surface.guard('edit'),
    validateBody(DealPackageCreateSchema),
    handle((c, req) => dealService.createPackage(c.vendorId, c.branchId, c.dealId, req.body), {
      action: 'deal_package.create',
      targetType: 'DealPackage',
      status: 201,
    }),
  );
  router.patch(
    `${deal}/packages/reorder`,
    surface.guard('edit'),
    validateBody(DealPackageReorderSchema),
    handle((c, req) => dealService.reorderPackages(c.vendorId, c.branchId, c.dealId, req.body.packageIds)),
  );
  router.patch(
    `${deal}/packages/:packageId`,
    surface.guard('edit'),
    validateBody(DealPackageUpdateSchema),
    handle((c, req) => dealService.updatePackage(c.vendorId, c.branchId, c.dealId, c.packageId, req.body), {
      action: 'deal_package.update',
      targetType: 'DealPackage',
    }),
  );
  router.delete(
    `${deal}/packages/:packageId`,
    surface.guard('edit'),
    handle((c) => dealService.deletePackage(c.vendorId, c.branchId, c.dealId, c.packageId), {
      action: 'deal_package.delete',
      targetType: 'DealPackage',
    }),
  );

  // Media (static `reorder` before `:imageId`)
  router.post(
    `${deal}/images`,
    surface.guard('edit'),
    imageUpload.single('file'),
    handle((c, req) => dealService.addDealImage(c.vendorId, c.branchId, c.dealId, upload(req.file)), {
      action: 'deal_image.create',
      targetType: 'DealImage',
      status: 201,
    }),
  );
  router.patch(
    `${deal}/images/reorder`,
    surface.guard('edit'),
    validateBody(MediaReorderSchema),
    handle(async (c, req) => {
      await dealService.reorderDealImages(c.vendorId, c.branchId, c.dealId, req.body.imageIds);
      return { reordered: true };
    }),
  );
  router.patch(
    `${deal}/images/:imageId/primary`,
    surface.guard('edit'),
    handle(async (c) => {
      await dealService.setDealPrimaryImage(c.vendorId, c.branchId, c.dealId, c.imageId);
      return { primary: true };
    }),
  );
  router.patch(
    `${deal}/images/:imageId`,
    surface.guard('edit'),
    validateBody(DealImageUpdateSchema),
    handle((c, req) => dealService.updateDealImage(c.vendorId, c.branchId, c.dealId, c.imageId, req.body.altText), {
      action: 'deal_image.update',
      targetType: 'DealImage',
    }),
  );
  router.delete(
    `${deal}/images/:imageId`,
    surface.guard('edit'),
    handle(
      async (c) => {
        await dealService.deleteDealImage(c.vendorId, c.branchId, c.dealId, c.imageId);
        return { deleted: true };
      },
      { action: 'deal_image.delete', targetType: 'DealImage' },
    ),
  );
  router.post(
    `${deal}/video`,
    surface.guard('edit'),
    videoUpload.single('file'),
    handle((c, req) => dealService.replaceDealVideo(c.vendorId, c.branchId, c.dealId, upload(req.file)), {
      action: 'deal_video.upsert',
      targetType: 'DealVideo',
      status: 201,
    }),
  );
  router.delete(
    `${deal}/video`,
    surface.guard('edit'),
    handle(
      async (c) => {
        await dealService.deleteDealVideo(c.vendorId, c.branchId, c.dealId);
        return { deleted: true };
      },
      { action: 'deal_video.delete', targetType: 'DealVideo' },
    ),
  );
}
