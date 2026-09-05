import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import type { PermissionAction } from '@skylabs-monorepo/shared-types';
import { can } from '@skylabs-monorepo/shared-permissions';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { resolveGrantedPermissionKeys } from '../services/permission-resolver.service';
import { sendError } from '../lib/http';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { UuidParamSchema, PaginationQuerySchema } from '../schemas/common.schema';
import {
  VendorCreateSchema,
  VendorUpdateSchema,
  VendorSelfCreateSchema,
  VendorSelfUpdateSchema,
  VendorRejectSchema,
  VendorStatusUpdateSchema,
  VendorKycReviewSchema,
  VendorListQuerySchema,
  VendorUserSearchQuerySchema,
  CrossVendorListQuerySchema,
  BranchCreateSchema,
  BranchUpdateSchema,
  BranchStatusUpdateSchema,
  DealCreateSchema,
  DealUpdateSchema,
  DealStatusUpdateSchema,
  DealRejectSchema,
  TherapistCreateSchema,
  TherapistUpdateSchema,
  TherapistStatusUpdateSchema,
  TherapistPackageCreateSchema,
  TherapistPackageUpdateSchema,
  VendorModulesAndCategoryAccessSchema,
  VendorIdParamSchema,
  VendorDocumentTypeParamSchema,
  VendorDocumentAdminParamSchema,
  VendorImageIdParamSchema,
  VendorProductIdParamSchema,
} from '../schemas/vendor.schema';
import { ProductCreateSchema, ProductUpdateSchema, ProductStatusUpdateSchema, ProductListQuerySchema } from '../schemas/product.schema';
import { MediaReorderSchema } from '../schemas/media.schema';
import { imageUpload, videoUpload, documentUpload } from '../lib/media-upload.middleware';
import type { VendorDocumentType } from '../generated/prisma-client';
import * as vendorService from '../services/vendor.service';
import * as vendorDocumentService from '../services/vendor-document.service';
import * as productService from '../services/product.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData, ApiError } from '../lib/http';

const router = Router();
router.use(authenticate);

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

/** Attaches the same completion-checklist shape (steps 1-6) to every Vendor response the
 *  admin onboarding pipeline and self-service profile screen both read step-lock state from. */
function withCompletion<T extends Record<string, unknown>>(vendor: T) {
  return { ...vendor, profileCompletion: vendorService.computeProfileCompletion(vendor) };
}

/**
 * Same shape/behavior as `requirePermission`, but passes if the caller holds ANY of the given
 * actions rather than exactly one. Used only for `/users/search`, which is a legitimate step
 * of both the "Add Vendor" (`vendors:create`) and "Edit Vendor → re-link owner" (`vendors:edit`)
 * flows — gating it on `create` alone would 403 an edit-only admin reaching Step 1 while
 * resuming a draft vendor, which would look like "search is broken" even though nothing is
 * actually disabled client-side.
 */
function requireAnyPermission(menuKey: string, actions: PermissionAction[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      sendError(res, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    try {
      const granted = await resolveGrantedPermissionKeys(req.user.roles);
      if (!actions.some((action) => can(granted, menuKey, action))) {
        sendError(res, 'FORBIDDEN', `Missing permission ${menuKey}:${actions.join('|')}`);
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

// ─── Reference lookups ───────────────────────────────────────────────────────

const VendorCategoriesQuerySchema = z.object({
  type: z.enum(['SERVICE', 'PRODUCT', 'THERAPY']).optional(),
  vendorId: z.string().uuid().optional(),
});

router.get('/categories', validateQuery(VendorCategoriesQuerySchema), async (req, res, next) => {
  try {
    const { type, vendorId } = req.validatedQuery as ReturnType<typeof VendorCategoriesQuerySchema.parse>;
    sendData(res, await vendorService.listCategories({ type, vendorId }));
  } catch (err) {
    next(err);
  }
});

/**
 * Existing-user typeahead for the "Add Vendor → Select Existing User" step. Deliberately
 * gated on `vendors:create`/`vendors:edit` (not `rbac.users:view`) — this is a narrow lookup
 * for linking a vendor owner, not a grant of the full User Management console. `edit` is
 * included alongside `create` because Step 1 of the pipeline is also reachable while resuming
 * an existing draft vendor. Only eligible users are returned (active, not already linked to a
 * vendor) — filtered server-side in `searchEligibleOwnerCandidates`, never left to the
 * frontend to exclude.
 */
router.get('/users/search', requireAnyPermission('vendors', ['create', 'edit']), validateQuery(VendorUserSearchQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, q } = req.validatedQuery as ReturnType<typeof VendorUserSearchQuerySchema.parse>;
    const { items, total } = await vendorService.searchEligibleOwnerCandidates(q, page, pageSize);
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

/**
 * Cross-vendor listings for the sidebar's standalone "Branches"/"Deals" admin pages — gated on
 * the existing `vendors:view` (the same permission the "Vendors" sidebar item already uses, so
 * no new permission key or seed grant is needed; the `vendor` role still never holds this).
 */
router.get('/branches', requirePermission('vendors', 'view'), validateQuery(CrossVendorListQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, search } = req.validatedQuery as ReturnType<typeof CrossVendorListQuerySchema.parse>;
    const { items, total } = await vendorService.listAllBranches({ page, pageSize, search });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.get('/deals', requirePermission('vendors', 'view'), validateQuery(CrossVendorListQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, search } = req.validatedQuery as ReturnType<typeof CrossVendorListQuerySchema.parse>;
    const { items, total } = await vendorService.listAllDeals({ page, pageSize, search });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.get('/therapists', requirePermission('vendors', 'view'), validateQuery(CrossVendorListQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, search } = req.validatedQuery as ReturnType<typeof CrossVendorListQuerySchema.parse>;
    const { items, total } = await vendorService.listAllTherapists({ page, pageSize, search });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

// ─── Self-service — vendorId is ALWAYS derived from req.user.sub, never a param/body value ──

router.get('/me', requirePermission('vendors', 'custom'), async (req, res, next) => {
  try {
    const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
    sendData(res, withCompletion(vendor));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/me',
  requirePermission('vendors', 'custom'),
  validateBody(VendorSelfCreateSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.createSelfVendor(req.user!.sub, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'vendor.self_register',
        targetType: 'Vendor',
        targetId: vendor.id,
        after: vendor,
        ...requestMeta(req),
      });
      sendData(res, vendor, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/me',
  requirePermission('vendors', 'custom'),
  validateBody(VendorSelfUpdateSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.updateSelfVendor(req.user!.sub, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'vendor.self_update',
        targetType: 'Vendor',
        targetId: vendor.id,
        after: vendor,
        ...requestMeta(req),
      });
      sendData(res, vendor);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Vendor media, self-service (shared upload system — see media.service.ts's doc comment) ──

router.post(
  '/me/images',
  requirePermission('vendors', 'custom'),
  imageUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded.');
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      const image = await vendorService.addVendorImage(vendor.id, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
      });
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'vendor_image.create',
        targetType: 'VendorImage',
        targetId: image.id,
        ...requestMeta(req),
      });
      sendData(res, image, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/me/images/:imageId', requirePermission('vendors', 'custom'), async (req, res, next) => {
  try {
    const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
    await vendorService.deleteVendorImage(vendor.id, req.params.imageId);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'vendor_image.delete',
      targetType: 'VendorImage',
      targetId: req.params.imageId,
      ...requestMeta(req),
    });
    sendData(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/me/images/reorder',
  requirePermission('vendors', 'custom'),
  validateBody(MediaReorderSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      await vendorService.reorderVendorImages(vendor.id, req.body.imageIds);
      sendData(res, { reordered: true });
    } catch (err) {
      next(err);
    }
  },
);

router.patch('/me/images/:imageId/primary', requirePermission('vendors', 'custom'), async (req, res, next) => {
  try {
    const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
    await vendorService.setVendorPrimaryImage(vendor.id, req.params.imageId);
    sendData(res, { primary: true });
  } catch (err) {
    next(err);
  }
});

// ─── Vendor KYC documents, self-service (real file upload — GST/PAN/Aadhaar, one active file
// per type; replaces the deprecated `kycDocuments` pasted-URL list) ──────────────────────────

router.get('/me/kyc-documents', requirePermission('vendors', 'custom'), async (req, res, next) => {
  try {
    const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
    sendData(res, await vendorDocumentService.listVendorDocuments(vendor.id));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/me/kyc-documents/:documentType',
  requirePermission('vendors', 'custom'),
  validateParams(VendorDocumentTypeParamSchema),
  documentUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded.');
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      const document = await vendorDocumentService.uploadVendorDocument(vendor.id, req.params.documentType as VendorDocumentType, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
      });
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'vendor_document.upload',
        targetType: 'VendorDocument',
        targetId: document.id,
        ...requestMeta(req),
      });
      sendData(res, document, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/me/kyc-documents/:documentType',
  requirePermission('vendors', 'custom'),
  validateParams(VendorDocumentTypeParamSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      await vendorDocumentService.deleteVendorDocument(vendor.id, req.params.documentType as VendorDocumentType);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'vendor_document.delete',
        targetType: 'VendorDocument',
        targetId: req.params.documentType,
        ...requestMeta(req),
      });
      sendData(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/me/video',
  requirePermission('vendors', 'custom'),
  videoUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded.');
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      const video = await vendorService.replaceVendorVideo(vendor.id, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
      });
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'vendor_video.upsert',
        targetType: 'VendorVideo',
        targetId: video.id,
        ...requestMeta(req),
      });
      sendData(res, video, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/me/video', requirePermission('vendors', 'custom'), async (req, res, next) => {
  try {
    const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
    await vendorService.deleteVendorVideo(vendor.id);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'vendor_video.delete',
      targetType: 'VendorVideo',
      targetId: vendor.id,
      ...requestMeta(req),
    });
    sendData(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

router.post('/me/submit', requirePermission('vendors', 'custom'), async (req, res, next) => {
  try {
    const vendor = await vendorService.submitForVerification(req.user!.sub);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'vendor.submit_for_verification',
      targetType: 'Vendor',
      targetId: vendor.id,
      after: { status: vendor.status },
      ...requestMeta(req),
    });
    sendData(res, vendor);
  } catch (err) {
    next(err);
  }
});

router.get('/me/branches', requirePermission('vendors', 'custom'), async (req, res, next) => {
  try {
    const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
    sendData(res, await vendorService.listBranches(vendor.id));
  } catch (err) {
    next(err);
  }
});

// ─── Business modules + Category access (onboarding wizard Step 2) ──────────────────────────
// Replace-the-full-set pattern, same shape as rbac.routes.ts's PUT /roles/:id/permissions.

router.get('/me/category-access', requirePermission('vendors', 'custom'), async (req, res, next) => {
  try {
    const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
    sendData(res, await vendorService.getVendorCategoryAccess(vendor.id));
  } catch (err) {
    next(err);
  }
});

router.put(
  '/me/category-access',
  requirePermission('vendors', 'custom'),
  validateBody(VendorModulesAndCategoryAccessSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      const result = await vendorService.setVendorModulesAndCategoryAccess(vendor.id, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'vendor.category_access.update',
        targetType: 'Vendor',
        targetId: vendor.id,
        after: req.body,
        ...requestMeta(req),
      });
      sendData(res, result);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Distinct customers who have ordered from the caller's own vendor — for the vendor-facing
 * "Customers" screen. Derived entirely from existing Order rows (no new table); paginates the
 * distinct-customer list, not the raw Order rows.
 */
router.get('/me/customers', requirePermission('vendors', 'custom'), validateQuery(PaginationQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize } = req.validatedQuery as ReturnType<typeof PaginationQuerySchema.parse>;
    const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
    const { items, total } = await vendorService.listMyCustomers(vendor.id, { page, pageSize });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/me/branches',
  requirePermission('vendors', 'custom'),
  validateBody(BranchCreateSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      const branch = await vendorService.createBranch(vendor.id, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'branch.create',
        targetType: 'Branch',
        targetId: branch.id,
        after: branch,
        ...requestMeta(req),
      });
      sendData(res, branch, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/me/branches/:branchId',
  requirePermission('vendors', 'custom'),
  validateBody(BranchUpdateSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      const branch = await vendorService.updateBranch(vendor.id, req.params.branchId, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'branch.update',
        targetType: 'Branch',
        targetId: branch.id,
        after: branch,
        ...requestMeta(req),
      });
      sendData(res, branch);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/me/branches/:branchId/status',
  requirePermission('vendors', 'custom'),
  validateBody(BranchStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      const branch = await vendorService.setBranchStatus(vendor.id, req.params.branchId, req.body.isActive);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'branch.status_change',
        targetType: 'Branch',
        targetId: branch.id,
        after: { isActive: branch.isActive },
        ...requestMeta(req),
      });
      sendData(res, branch);
    } catch (err) {
      next(err);
    }
  },
);

router.get('/me/branches/:branchId/deals', requirePermission('vendors', 'custom'), async (req, res, next) => {
  try {
    const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
    sendData(res, await vendorService.listDeals(vendor.id, req.params.branchId));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/me/branches/:branchId/deals',
  requirePermission('vendors', 'custom'),
  validateBody(DealCreateSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      const deal = await vendorService.createDeal(vendor.id, req.params.branchId, req.body, false);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'deal.create',
        targetType: 'Deal',
        targetId: deal.id,
        after: deal,
        ...requestMeta(req),
      });
      sendData(res, deal, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/me/branches/:branchId/deals/:dealId',
  requirePermission('vendors', 'custom'),
  validateBody(DealUpdateSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      const deal = await vendorService.updateDeal(vendor.id, req.params.branchId, req.params.dealId, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'deal.update',
        targetType: 'Deal',
        targetId: deal.id,
        after: deal,
        ...requestMeta(req),
      });
      sendData(res, deal);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/me/branches/:branchId/deals/:dealId/status',
  requirePermission('vendors', 'custom'),
  validateBody(DealStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      const deal = await vendorService.setDealStatus(vendor.id, req.params.branchId, req.params.dealId, req.body.status, false);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'deal.status_change',
        targetType: 'Deal',
        targetId: deal.id,
        after: { status: deal.status },
        ...requestMeta(req),
      });
      sendData(res, deal);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Deal media (shared upload system — see media.service.ts's doc comment) ─────────────────

router.post(
  '/me/branches/:branchId/deals/:dealId/images',
  requirePermission('vendors', 'custom'),
  imageUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded.');
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      const image = await vendorService.addDealImage(vendor.id, req.params.branchId, req.params.dealId, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
      });
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'deal_image.create',
        targetType: 'DealImage',
        targetId: image.id,
        ...requestMeta(req),
      });
      sendData(res, image, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/me/branches/:branchId/deals/:dealId/images/:imageId',
  requirePermission('vendors', 'custom'),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      await vendorService.deleteDealImage(vendor.id, req.params.branchId, req.params.dealId, req.params.imageId);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'deal_image.delete',
        targetType: 'DealImage',
        targetId: req.params.imageId,
        ...requestMeta(req),
      });
      sendData(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/me/branches/:branchId/deals/:dealId/images/reorder',
  requirePermission('vendors', 'custom'),
  validateBody(MediaReorderSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      await vendorService.reorderDealImages(vendor.id, req.params.branchId, req.params.dealId, req.body.imageIds);
      sendData(res, { reordered: true });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/me/branches/:branchId/deals/:dealId/images/:imageId/primary',
  requirePermission('vendors', 'custom'),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      await vendorService.setDealPrimaryImage(vendor.id, req.params.branchId, req.params.dealId, req.params.imageId);
      sendData(res, { primary: true });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/me/branches/:branchId/deals/:dealId/video',
  requirePermission('vendors', 'custom'),
  videoUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded.');
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      const video = await vendorService.replaceDealVideo(vendor.id, req.params.branchId, req.params.dealId, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
      });
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'deal_video.upsert',
        targetType: 'DealVideo',
        targetId: video.id,
        ...requestMeta(req),
      });
      sendData(res, video, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/me/branches/:branchId/deals/:dealId/video',
  requirePermission('vendors', 'custom'),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      await vendorService.deleteDealVideo(vendor.id, req.params.branchId, req.params.dealId);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'deal_video.delete',
        targetType: 'DealVideo',
        targetId: req.params.dealId,
        ...requestMeta(req),
      });
      sendData(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Therapist (self-service — mirrors Branch's exact pattern) ──────────────

router.get('/me/branches/:branchId/therapists', requirePermission('vendors', 'custom'), async (req, res, next) => {
  try {
    const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
    sendData(res, await vendorService.listTherapists(vendor.id, req.params.branchId));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/me/branches/:branchId/therapists',
  requirePermission('vendors', 'custom'),
  validateBody(TherapistCreateSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      const therapist = await vendorService.createTherapist(vendor.id, req.params.branchId, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'therapist.create',
        targetType: 'Therapist',
        targetId: therapist.id,
        after: therapist,
        ...requestMeta(req),
      });
      sendData(res, therapist, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/me/therapists/:therapistId',
  requirePermission('vendors', 'custom'),
  validateBody(TherapistUpdateSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      const therapist = await vendorService.updateTherapist(vendor.id, req.params.therapistId, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'therapist.update',
        targetType: 'Therapist',
        targetId: therapist.id,
        after: therapist,
        ...requestMeta(req),
      });
      sendData(res, therapist);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/me/therapists/:therapistId/status',
  requirePermission('vendors', 'custom'),
  validateBody(TherapistStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      const therapist = await vendorService.setTherapistStatus(vendor.id, req.params.therapistId, req.body.isActive);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'therapist.status_change',
        targetType: 'Therapist',
        targetId: therapist.id,
        after: { isActive: therapist.isActive },
        ...requestMeta(req),
      });
      sendData(res, therapist);
    } catch (err) {
      next(err);
    }
  },
);

// ─── TherapistPackage (per-therapist price for one specific service Deal) ────

router.get('/me/therapists/:therapistId/packages', requirePermission('vendors', 'custom'), async (req, res, next) => {
  try {
    const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
    sendData(res, await vendorService.listTherapistPackages(vendor.id, req.params.therapistId));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/me/therapists/:therapistId/packages',
  requirePermission('vendors', 'custom'),
  validateBody(TherapistPackageCreateSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      const pkg = await vendorService.createTherapistPackage(vendor.id, req.params.therapistId, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'therapist_package.create',
        targetType: 'TherapistPackage',
        targetId: pkg.id,
        after: pkg,
        ...requestMeta(req),
      });
      sendData(res, pkg, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/me/therapists/:therapistId/packages/:packageId',
  requirePermission('vendors', 'custom'),
  validateBody(TherapistPackageUpdateSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      const pkg = await vendorService.updateTherapistPackage(vendor.id, req.params.therapistId, req.params.packageId, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'therapist_package.update',
        targetType: 'TherapistPackage',
        targetId: pkg.id,
        after: pkg,
        ...requestMeta(req),
      });
      sendData(res, pkg);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/me/therapists/:therapistId/packages/:packageId',
  requirePermission('vendors', 'custom'),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      await vendorService.deleteTherapistPackage(vendor.id, req.params.therapistId, req.params.packageId);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'therapist_package.delete',
        targetType: 'TherapistPackage',
        targetId: req.params.packageId,
        ...requestMeta(req),
      });
      sendData(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Therapist media (shared upload system — see media.service.ts's doc comment) ────────────

router.post(
  '/me/therapists/:therapistId/images',
  requirePermission('vendors', 'custom'),
  imageUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded.');
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      const image = await vendorService.addTherapistImage(vendor.id, req.params.therapistId, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
      });
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'therapist_image.create',
        targetType: 'TherapistImage',
        targetId: image.id,
        ...requestMeta(req),
      });
      sendData(res, image, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/me/therapists/:therapistId/images/:imageId',
  requirePermission('vendors', 'custom'),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      await vendorService.deleteTherapistImage(vendor.id, req.params.therapistId, req.params.imageId);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'therapist_image.delete',
        targetType: 'TherapistImage',
        targetId: req.params.imageId,
        ...requestMeta(req),
      });
      sendData(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/me/therapists/:therapistId/images/reorder',
  requirePermission('vendors', 'custom'),
  validateBody(MediaReorderSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      await vendorService.reorderTherapistImages(vendor.id, req.params.therapistId, req.body.imageIds);
      sendData(res, { reordered: true });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/me/therapists/:therapistId/images/:imageId/primary',
  requirePermission('vendors', 'custom'),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      await vendorService.setTherapistPrimaryImage(vendor.id, req.params.therapistId, req.params.imageId);
      sendData(res, { primary: true });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/me/therapists/:therapistId/video',
  requirePermission('vendors', 'custom'),
  videoUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded.');
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      const video = await vendorService.replaceTherapistVideo(vendor.id, req.params.therapistId, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
      });
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'therapist_video.upsert',
        targetType: 'TherapistVideo',
        targetId: video.id,
        ...requestMeta(req),
      });
      sendData(res, video, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/me/therapists/:therapistId/video',
  requirePermission('vendors', 'custom'),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      await vendorService.deleteTherapistVideo(vendor.id, req.params.therapistId);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'therapist_video.delete',
        targetType: 'TherapistVideo',
        targetId: req.params.therapistId,
        ...requestMeta(req),
      });
      sendData(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Product (self-service — vendor-owned catalog, mirrors Branch/Therapist's exact split) ──

router.get('/me/products', requirePermission('products', 'view'), validateQuery(ProductListQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, search, categoryId, subcategoryId, status } = req.validatedQuery as ReturnType<typeof ProductListQuerySchema.parse>;
    const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
    const { items, total } = await productService.listProducts({ page, pageSize, search, categoryId, subcategoryId, status, vendorId: vendor.id });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/me/products',
  requirePermission('products', 'create'),
  validateBody(ProductCreateSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      const product = await productService.createProduct(vendor.id, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'product.create',
        targetType: 'Product',
        targetId: product.id,
        after: product,
        ...requestMeta(req),
      });
      sendData(res, product, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/me/products/:productId',
  requirePermission('products', 'edit'),
  validateBody(ProductUpdateSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      const product = await productService.updateProduct(vendor.id, req.params.productId, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'product.update',
        targetType: 'Product',
        targetId: product.id,
        after: product,
        ...requestMeta(req),
      });
      sendData(res, product);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/me/products/:productId/status',
  requirePermission('products', 'edit'),
  validateBody(ProductStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      const product = await productService.setProductStatus(vendor.id, req.params.productId, req.body.isActive);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'product.status_change',
        targetType: 'Product',
        targetId: product.id,
        after: { isActive: product.isActive },
        ...requestMeta(req),
      });
      sendData(res, product);
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/me/products/:productId', requirePermission('products', 'delete'), async (req, res, next) => {
  try {
    const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
    const before = await productService.getProductScopedOrThrow(vendor.id, req.params.productId);
    await productService.deleteProduct(vendor.id, req.params.productId);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'product.delete',
      targetType: 'Product',
      targetId: req.params.productId,
      before,
      ...requestMeta(req),
    });
    sendData(res, null);
  } catch (err) {
    next(err);
  }
});

// ─── Product media (self-service — shared upload system, see media.service.ts's doc comment) ─

router.post(
  '/me/products/:productId/images',
  requirePermission('products', 'edit'),
  imageUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded.');
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      await productService.getProductScopedOrThrow(vendor.id, req.params.productId);
      const image = await productService.addProductImage(req.params.productId, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
      });
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'product_image.create',
        targetType: 'ProductImage',
        targetId: image.id,
        ...requestMeta(req),
      });
      sendData(res, image, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/me/products/:productId/images/:imageId', requirePermission('products', 'edit'), async (req, res, next) => {
  try {
    const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
    await productService.getProductScopedOrThrow(vendor.id, req.params.productId);
    await productService.deleteProductImage(req.params.productId, req.params.imageId);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'product_image.delete',
      targetType: 'ProductImage',
      targetId: req.params.imageId,
      ...requestMeta(req),
    });
    sendData(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/me/products/:productId/images/reorder',
  requirePermission('products', 'edit'),
  validateBody(MediaReorderSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      await productService.getProductScopedOrThrow(vendor.id, req.params.productId);
      await productService.reorderProductImages(req.params.productId, req.body.imageIds);
      sendData(res, { reordered: true });
    } catch (err) {
      next(err);
    }
  },
);

router.patch('/me/products/:productId/images/:imageId/primary', requirePermission('products', 'edit'), async (req, res, next) => {
  try {
    const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
    await productService.getProductScopedOrThrow(vendor.id, req.params.productId);
    await productService.setProductPrimaryImage(req.params.productId, req.params.imageId);
    sendData(res, { primary: true });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/me/products/:productId/video',
  requirePermission('products', 'edit'),
  videoUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded.');
      const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
      await productService.getProductScopedOrThrow(vendor.id, req.params.productId);
      const video = await productService.replaceProductVideo(req.params.productId, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
      });
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'product_video.upsert',
        targetType: 'ProductVideo',
        targetId: video.id,
        ...requestMeta(req),
      });
      sendData(res, video, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/me/products/:productId/video', requirePermission('products', 'edit'), async (req, res, next) => {
  try {
    const vendor = await vendorService.getMyVendorOrThrow(req.user!.sub);
    await productService.getProductScopedOrThrow(vendor.id, req.params.productId);
    await productService.deleteProductVideo(req.params.productId);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'product_video.delete',
      targetType: 'ProductVideo',
      targetId: req.params.productId,
      ...requestMeta(req),
    });
    sendData(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

// ─── Admin/SuperAdmin surface ─────────────────────────────────────────────────

router.get('/', requirePermission('vendors', 'view'), validateQuery(VendorListQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, search, status } = req.validatedQuery as ReturnType<typeof VendorListQuerySchema.parse>;
    const { items, total } = await vendorService.listVendors({ page, pageSize, search, status });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePermission('vendors', 'create'), validateBody(VendorCreateSchema), async (req, res, next) => {
  try {
    const vendor = await vendorService.createVendor(req.body, req.user!.sub);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'vendor.create',
      targetType: 'Vendor',
      targetId: vendor.id,
      after: vendor,
      ...requestMeta(req),
    });
    sendData(res, withCompletion(vendor), { status: 201 });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requirePermission('vendors', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, withCompletion(await vendorService.getVendorOrThrow(req.params.id)));
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id',
  requirePermission('vendors', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(VendorUpdateSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.updateVendor(req.params.id, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'vendor.update',
        targetType: 'Vendor',
        targetId: vendor.id,
        after: vendor,
        ...requestMeta(req),
      });
      sendData(res, withCompletion(vendor));
    } catch (err) {
      next(err);
    }
  },
);

// ─── Vendor media, admin (shared upload system — see media.service.ts's doc comment) ─────────

router.post(
  '/:id/images',
  requirePermission('vendors', 'edit'),
  validateParams(UuidParamSchema),
  imageUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded.');
      const image = await vendorService.addVendorImage(req.params.id, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
      });
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'vendor_image.create',
        targetType: 'VendorImage',
        targetId: image.id,
        ...requestMeta(req),
      });
      sendData(res, image, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:id/images/:imageId',
  requirePermission('vendors', 'edit'),
  validateParams(VendorImageIdParamSchema),
  async (req, res, next) => {
    try {
      await vendorService.deleteVendorImage(req.params.id, req.params.imageId);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'vendor_image.delete',
        targetType: 'VendorImage',
        targetId: req.params.imageId,
        ...requestMeta(req),
      });
      sendData(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id/images/reorder',
  requirePermission('vendors', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(MediaReorderSchema),
  async (req, res, next) => {
    try {
      await vendorService.reorderVendorImages(req.params.id, req.body.imageIds);
      sendData(res, { reordered: true });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id/images/:imageId/primary',
  requirePermission('vendors', 'edit'),
  validateParams(VendorImageIdParamSchema),
  async (req, res, next) => {
    try {
      await vendorService.setVendorPrimaryImage(req.params.id, req.params.imageId);
      sendData(res, { primary: true });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/video',
  requirePermission('vendors', 'edit'),
  validateParams(UuidParamSchema),
  videoUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded.');
      const video = await vendorService.replaceVendorVideo(req.params.id, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
      });
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'vendor_video.upsert',
        targetType: 'VendorVideo',
        targetId: video.id,
        ...requestMeta(req),
      });
      sendData(res, video, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:id/video',
  requirePermission('vendors', 'edit'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      await vendorService.deleteVendorVideo(req.params.id);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'vendor_video.delete',
        targetType: 'VendorVideo',
        targetId: req.params.id,
        ...requestMeta(req),
      });
      sendData(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Vendor KYC documents, admin-on-behalf (real file upload) ───────────────────────────────

router.get('/:id/kyc-documents', requirePermission('vendors', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, await vendorDocumentService.listVendorDocuments(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/kyc-documents/:documentType',
  requirePermission('vendors', 'edit'),
  validateParams(VendorDocumentAdminParamSchema),
  documentUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded.');
      const document = await vendorDocumentService.uploadVendorDocument(req.params.id, req.params.documentType as VendorDocumentType, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
      });
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'vendor_document.upload',
        targetType: 'VendorDocument',
        targetId: document.id,
        ...requestMeta(req),
      });
      sendData(res, document, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:id/kyc-documents/:documentType',
  requirePermission('vendors', 'edit'),
  validateParams(VendorDocumentAdminParamSchema),
  async (req, res, next) => {
    try {
      await vendorDocumentService.deleteVendorDocument(req.params.id, req.params.documentType as VendorDocumentType);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'vendor_document.delete',
        targetType: 'VendorDocument',
        targetId: req.params.documentType,
        ...requestMeta(req),
      });
      sendData(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id/approve',
  requirePermission('vendors', 'approve'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.approveVendor(req.params.id);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'vendor.approve',
        targetType: 'Vendor',
        targetId: vendor.id,
        after: { status: vendor.status },
        ...requestMeta(req),
      });
      sendData(res, vendor);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id/reject',
  requirePermission('vendors', 'reject'),
  validateParams(UuidParamSchema),
  validateBody(VendorRejectSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.rejectVendor(req.params.id, req.body.reason);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'vendor.reject',
        targetType: 'Vendor',
        targetId: vendor.id,
        after: { status: vendor.status, reason: req.body.reason },
        ...requestMeta(req),
      });
      sendData(res, vendor);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id/status',
  requirePermission('vendors', 'status_change'),
  validateParams(UuidParamSchema),
  validateBody(VendorStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.setVendorStatus(req.params.id, req.body.status, req.body.reason);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'vendor.status_change',
        targetType: 'Vendor',
        targetId: vendor.id,
        after: { status: vendor.status },
        ...requestMeta(req),
      });
      sendData(res, vendor);
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/:id', requirePermission('vendors', 'delete'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    const before = await vendorService.getVendorOrThrow(req.params.id);
    await vendorService.deleteVendor(req.params.id);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'vendor.delete',
      targetType: 'Vendor',
      targetId: req.params.id,
      before,
      ...requestMeta(req),
    });
    sendData(res, null);
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id/kyc-review',
  requirePermission('vendors', 'approve'),
  validateParams(UuidParamSchema),
  validateBody(VendorKycReviewSchema),
  async (req, res, next) => {
    try {
      const vendor = await vendorService.reviewKyc(req.params.id, req.body.kycStatus, req.body.rejectionReason);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'vendor.kyc_review',
        targetType: 'Vendor',
        targetId: vendor.id,
        after: { kycStatus: vendor.kycStatus, rejectionReason: vendor.kycRejectionReason },
        ...requestMeta(req),
      });
      sendData(res, vendor);
    } catch (err) {
      next(err);
    }
  },
);

router.get('/:vendorId/branches', requirePermission('vendors', 'view'), async (req, res, next) => {
  try {
    sendData(res, await vendorService.listBranches(req.params.vendorId));
  } catch (err) {
    next(err);
  }
});

router.get(
  '/:vendorId/category-access',
  requirePermission('vendors', 'view'),
  validateParams(VendorIdParamSchema),
  async (req, res, next) => {
    try {
      sendData(res, await vendorService.getVendorCategoryAccess(req.params.vendorId));
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/:vendorId/category-access',
  requirePermission('vendors', 'edit'),
  validateParams(VendorIdParamSchema),
  validateBody(VendorModulesAndCategoryAccessSchema),
  async (req, res, next) => {
    try {
      const result = await vendorService.setVendorModulesAndCategoryAccess(req.params.vendorId, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'vendor.category_access.update',
        targetType: 'Vendor',
        targetId: req.params.vendorId,
        after: req.body,
        ...requestMeta(req),
      });
      sendData(res, result);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * All of a vendor's therapists (active AND inactive, across every branch) for the admin's
 * vendor detail page. Read-only — the admin-on-behalf create/update/status-change variants live
 * further down (`/:vendorId/branches/:branchId/therapists`, `/:vendorId/therapists/:therapistId
 * [/status]`), right after Branch/Deal's own admin-on-behalf routes, since a non-owner admin
 * can't reach the `/me/*` self-service paths (those resolve the vendor from the caller's own
 * `ownerUserId`). Gated on the same `vendors:view` every other purely-admin vendor read in this
 * file already uses — no new permission key needed.
 */
router.get(
  '/:vendorId/therapists',
  requirePermission('vendors', 'view'),
  validateParams(VendorIdParamSchema),
  async (req, res, next) => {
    try {
      sendData(res, await vendorService.listVendorTherapistsForAdmin(req.params.vendorId));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Distinct customers who have ordered/booked from a vendor, for the admin's vendor detail page.
 * Reuses the exact same `listMyCustomers` the self-service `/me/customers` route calls — that
 * function takes `vendorId` as a plain parameter and does no ownership resolution internally
 * (ownership is only relevant to the self-service route's `getMyVendorOrThrow` lookup), so no new
 * service logic is needed here. Deliberately read-only, same as `/:vendorId/therapists`, and
 * gated on the same `vendors:view` every other purely-admin vendor read in this file already uses.
 */
router.get(
  '/:vendorId/customers',
  requirePermission('vendors', 'view'),
  validateParams(VendorIdParamSchema),
  validateQuery(PaginationQuerySchema),
  async (req, res, next) => {
    try {
      const { page, pageSize } = req.validatedQuery as ReturnType<typeof PaginationQuerySchema.parse>;
      const { items, total } = await vendorService.listMyCustomers(req.params.vendorId, { page, pageSize });
      sendData(res, items, { meta: { total, page, pageSize } });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:vendorId/branches',
  requirePermission('vendors', 'create'),
  validateBody(BranchCreateSchema),
  async (req, res, next) => {
    try {
      const branch = await vendorService.createBranch(req.params.vendorId, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'branch.create',
        targetType: 'Branch',
        targetId: branch.id,
        after: branch,
        ...requestMeta(req),
      });
      sendData(res, branch, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:vendorId/branches/:branchId',
  requirePermission('vendors', 'edit'),
  validateBody(BranchUpdateSchema),
  async (req, res, next) => {
    try {
      const branch = await vendorService.updateBranch(req.params.vendorId, req.params.branchId, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'branch.update',
        targetType: 'Branch',
        targetId: branch.id,
        after: branch,
        ...requestMeta(req),
      });
      sendData(res, branch);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:vendorId/branches/:branchId/status',
  requirePermission('vendors', 'status_change'),
  validateBody(BranchStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const branch = await vendorService.setBranchStatus(req.params.vendorId, req.params.branchId, req.body.isActive);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'branch.status_change',
        targetType: 'Branch',
        targetId: branch.id,
        after: { isActive: branch.isActive },
        ...requestMeta(req),
      });
      sendData(res, branch);
    } catch (err) {
      next(err);
    }
  },
);

router.get('/:vendorId/branches/:branchId/deals', requirePermission('vendors', 'view'), async (req, res, next) => {
  try {
    sendData(res, await vendorService.listDeals(req.params.vendorId, req.params.branchId));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:vendorId/branches/:branchId/deals',
  requirePermission('vendors', 'create'),
  validateBody(DealCreateSchema),
  async (req, res, next) => {
    try {
      const deal = await vendorService.createDeal(req.params.vendorId, req.params.branchId, req.body, true);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'deal.create',
        targetType: 'Deal',
        targetId: deal.id,
        after: deal,
        ...requestMeta(req),
      });
      sendData(res, deal, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:vendorId/branches/:branchId/deals/:dealId',
  requirePermission('vendors', 'edit'),
  validateBody(DealUpdateSchema),
  async (req, res, next) => {
    try {
      const deal = await vendorService.updateDeal(req.params.vendorId, req.params.branchId, req.params.dealId, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'deal.update',
        targetType: 'Deal',
        targetId: deal.id,
        after: deal,
        ...requestMeta(req),
      });
      sendData(res, deal);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:vendorId/branches/:branchId/deals/:dealId/status',
  requirePermission('vendors', 'status_change'),
  validateBody(DealStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const deal = await vendorService.setDealStatus(
        req.params.vendorId,
        req.params.branchId,
        req.params.dealId,
        req.body.status,
        true,
      );
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'deal.status_change',
        targetType: 'Deal',
        targetId: deal.id,
        after: { status: deal.status },
        ...requestMeta(req),
      });
      sendData(res, deal);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:vendorId/branches/:branchId/deals/:dealId/approve',
  requirePermission('vendors', 'approve'),
  async (req, res, next) => {
    try {
      const deal = await vendorService.approveDeal(req.params.vendorId, req.params.branchId, req.params.dealId);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'deal.approve',
        targetType: 'Deal',
        targetId: deal.id,
        after: { approvalStatus: deal.approvalStatus, status: deal.status },
        ...requestMeta(req),
      });
      sendData(res, deal);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:vendorId/branches/:branchId/deals/:dealId/reject',
  requirePermission('vendors', 'reject'),
  validateBody(DealRejectSchema),
  async (req, res, next) => {
    try {
      const deal = await vendorService.rejectDeal(req.params.vendorId, req.params.branchId, req.params.dealId, req.body.rejectionReason);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'deal.reject',
        targetType: 'Deal',
        targetId: deal.id,
        after: { approvalStatus: deal.approvalStatus, rejectionReason: req.body.rejectionReason },
        ...requestMeta(req),
      });
      sendData(res, deal);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:vendorId/branches/:branchId/deals/:dealId',
  requirePermission('vendors', 'delete'),
  async (req, res, next) => {
    try {
      const before = await vendorService.getDealScopedOrThrow(req.params.vendorId, req.params.branchId, req.params.dealId);
      await vendorService.deleteDeal(req.params.vendorId, req.params.branchId, req.params.dealId);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'deal.delete',
        targetType: 'Deal',
        targetId: req.params.dealId,
        before,
        ...requestMeta(req),
      });
      sendData(res, null);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Therapist (admin-on-behalf — mirrors Branch/Deal's exact admin split) ──────────────────
// vendorId comes from the URL (not a JWT-derived `getMyVendorOrThrow`), so an admin/salesperson
// can create/edit a Therapist before the vendor has ever logged in (onboarding wizard Step 4).
// Reuses the exact same createTherapist/updateTherapist/setTherapistStatus service functions the
// self-service `/me/*` routes call — those already take vendorId as a plain parameter and do no
// ownership resolution internally, so the `specializationCategoryId` -> assertVendorHasCategoryAccess
// (THERAPY) check inside them runs unchanged for this path too; no bypass.

router.post(
  '/:vendorId/branches/:branchId/therapists',
  requirePermission('vendors', 'create'),
  validateBody(TherapistCreateSchema),
  async (req, res, next) => {
    try {
      const therapist = await vendorService.createTherapist(req.params.vendorId, req.params.branchId, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'therapist.create',
        targetType: 'Therapist',
        targetId: therapist.id,
        after: therapist,
        ...requestMeta(req),
      });
      sendData(res, therapist, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:vendorId/therapists/:therapistId',
  requirePermission('vendors', 'edit'),
  validateBody(TherapistUpdateSchema),
  async (req, res, next) => {
    try {
      const therapist = await vendorService.updateTherapist(req.params.vendorId, req.params.therapistId, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'therapist.update',
        targetType: 'Therapist',
        targetId: therapist.id,
        after: therapist,
        ...requestMeta(req),
      });
      sendData(res, therapist);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:vendorId/therapists/:therapistId/status',
  requirePermission('vendors', 'status_change'),
  validateBody(TherapistStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const therapist = await vendorService.setTherapistStatus(req.params.vendorId, req.params.therapistId, req.body.isActive);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'therapist.status_change',
        targetType: 'Therapist',
        targetId: therapist.id,
        after: { isActive: therapist.isActive },
        ...requestMeta(req),
      });
      sendData(res, therapist);
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/:vendorId/therapists/:therapistId', requirePermission('vendors', 'delete'), async (req, res, next) => {
  try {
    const before = await vendorService.getTherapistScopedOrThrow(req.params.vendorId, req.params.therapistId);
    await vendorService.deleteTherapist(req.params.vendorId, req.params.therapistId);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'therapist.delete',
      targetType: 'Therapist',
      targetId: req.params.therapistId,
      before,
      ...requestMeta(req),
    });
    sendData(res, null);
  } catch (err) {
    next(err);
  }
});

// ─── Therapist media (admin-on-behalf — mirrors the self-service block above exactly; these
// routes never existed, which was the actual root cause of "Superadmin's Add Therapist form has
// no image/video upload": `apps/msd/src/api/media.ts`'s `basePath()` for `'therapist'` had no
// admin/`vendorId` branch at all — same bug class as Product's own previously-fixed gap) ────────

router.post(
  '/:vendorId/therapists/:therapistId/images',
  requirePermission('vendors', 'edit'),
  imageUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded.');
      const image = await vendorService.addTherapistImage(req.params.vendorId, req.params.therapistId, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
      });
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'therapist_image.create',
        targetType: 'TherapistImage',
        targetId: image.id,
        ...requestMeta(req),
      });
      sendData(res, image, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:vendorId/therapists/:therapistId/images/:imageId',
  requirePermission('vendors', 'edit'),
  async (req, res, next) => {
    try {
      await vendorService.deleteTherapistImage(req.params.vendorId, req.params.therapistId, req.params.imageId);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'therapist_image.delete',
        targetType: 'TherapistImage',
        targetId: req.params.imageId,
        ...requestMeta(req),
      });
      sendData(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:vendorId/therapists/:therapistId/images/reorder',
  requirePermission('vendors', 'edit'),
  validateBody(MediaReorderSchema),
  async (req, res, next) => {
    try {
      await vendorService.reorderTherapistImages(req.params.vendorId, req.params.therapistId, req.body.imageIds);
      sendData(res, { reordered: true });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:vendorId/therapists/:therapistId/images/:imageId/primary',
  requirePermission('vendors', 'edit'),
  async (req, res, next) => {
    try {
      await vendorService.setTherapistPrimaryImage(req.params.vendorId, req.params.therapistId, req.params.imageId);
      sendData(res, { primary: true });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:vendorId/therapists/:therapistId/video',
  requirePermission('vendors', 'edit'),
  videoUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded.');
      const video = await vendorService.replaceTherapistVideo(req.params.vendorId, req.params.therapistId, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
      });
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'therapist_video.upsert',
        targetType: 'TherapistVideo',
        targetId: video.id,
        ...requestMeta(req),
      });
      sendData(res, video, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:vendorId/therapists/:therapistId/video',
  requirePermission('vendors', 'edit'),
  async (req, res, next) => {
    try {
      await vendorService.deleteTherapistVideo(req.params.vendorId, req.params.therapistId);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'therapist_video.delete',
        targetType: 'TherapistVideo',
        targetId: req.params.therapistId,
        ...requestMeta(req),
      });
      sendData(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Product (admin-on-behalf — mirrors Branch/Deal's exact admin split) ─────────────────────

router.get('/:vendorId/products', requirePermission('products', 'view'), validateParams(VendorIdParamSchema), validateQuery(ProductListQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, search, categoryId, subcategoryId, status } = req.validatedQuery as ReturnType<typeof ProductListQuerySchema.parse>;
    const { items, total } = await productService.listProducts({ page, pageSize, search, categoryId, subcategoryId, status, vendorId: req.params.vendorId });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:vendorId/products',
  requirePermission('products', 'create'),
  validateParams(VendorIdParamSchema),
  validateBody(ProductCreateSchema),
  async (req, res, next) => {
    try {
      const product = await productService.createProduct(req.params.vendorId, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'product.create',
        targetType: 'Product',
        targetId: product.id,
        after: product,
        ...requestMeta(req),
      });
      sendData(res, product, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:vendorId/products/:productId',
  requirePermission('products', 'edit'),
  validateParams(VendorProductIdParamSchema),
  validateBody(ProductUpdateSchema),
  async (req, res, next) => {
    try {
      const product = await productService.updateProduct(req.params.vendorId, req.params.productId, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'product.update',
        targetType: 'Product',
        targetId: product.id,
        after: product,
        ...requestMeta(req),
      });
      sendData(res, product);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:vendorId/products/:productId/status',
  requirePermission('products', 'edit'),
  validateParams(VendorProductIdParamSchema),
  validateBody(ProductStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const product = await productService.setProductStatus(req.params.vendorId, req.params.productId, req.body.isActive);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'product.status_change',
        targetType: 'Product',
        targetId: product.id,
        after: { isActive: product.isActive },
        ...requestMeta(req),
      });
      sendData(res, product);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:vendorId/products/:productId',
  requirePermission('products', 'delete'),
  validateParams(VendorProductIdParamSchema),
  async (req, res, next) => {
    try {
      const before = await productService.getProductScopedOrThrow(req.params.vendorId, req.params.productId);
      await productService.deleteProduct(req.params.vendorId, req.params.productId);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'product.delete',
        targetType: 'Product',
        targetId: req.params.productId,
        before,
        ...requestMeta(req),
      });
      sendData(res, null);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Product media (admin-on-behalf — mirrors the self-service block above exactly; these routes
// never existed, which was the actual root cause of "upload fails when adding/editing a product"
// from the Superadmin console: apps/msd/src/api/media.ts's `basePath()` always targets
// `/vendors/:vendorId/products/:productId/...` here (no `selfService` prop is ever passed from
// the admin product wizard), so every such request 404'd before reaching any validation) ────────

router.post(
  '/:vendorId/products/:productId/images',
  requirePermission('products', 'edit'),
  validateParams(VendorProductIdParamSchema),
  imageUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded.');
      await productService.getProductScopedOrThrow(req.params.vendorId, req.params.productId);
      const image = await productService.addProductImage(req.params.productId, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
      });
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'product_image.create',
        targetType: 'ProductImage',
        targetId: image.id,
        ...requestMeta(req),
      });
      sendData(res, image, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:vendorId/products/:productId/images/:imageId',
  requirePermission('products', 'edit'),
  validateParams(VendorProductIdParamSchema),
  async (req, res, next) => {
    try {
      await productService.getProductScopedOrThrow(req.params.vendorId, req.params.productId);
      await productService.deleteProductImage(req.params.productId, req.params.imageId);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'product_image.delete',
        targetType: 'ProductImage',
        targetId: req.params.imageId,
        ...requestMeta(req),
      });
      sendData(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:vendorId/products/:productId/images/reorder',
  requirePermission('products', 'edit'),
  validateParams(VendorProductIdParamSchema),
  validateBody(MediaReorderSchema),
  async (req, res, next) => {
    try {
      await productService.getProductScopedOrThrow(req.params.vendorId, req.params.productId);
      await productService.reorderProductImages(req.params.productId, req.body.imageIds);
      sendData(res, { reordered: true });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:vendorId/products/:productId/images/:imageId/primary',
  requirePermission('products', 'edit'),
  validateParams(VendorProductIdParamSchema),
  async (req, res, next) => {
    try {
      await productService.getProductScopedOrThrow(req.params.vendorId, req.params.productId);
      await productService.setProductPrimaryImage(req.params.productId, req.params.imageId);
      sendData(res, { primary: true });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:vendorId/products/:productId/video',
  requirePermission('products', 'edit'),
  validateParams(VendorProductIdParamSchema),
  videoUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded.');
      await productService.getProductScopedOrThrow(req.params.vendorId, req.params.productId);
      const video = await productService.replaceProductVideo(req.params.productId, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
      });
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'product_video.upsert',
        targetType: 'ProductVideo',
        targetId: video.id,
        ...requestMeta(req),
      });
      sendData(res, video, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:vendorId/products/:productId/video',
  requirePermission('products', 'edit'),
  validateParams(VendorProductIdParamSchema),
  async (req, res, next) => {
    try {
      await productService.getProductScopedOrThrow(req.params.vendorId, req.params.productId);
      await productService.deleteProductVideo(req.params.productId);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'product_video.delete',
        targetType: 'ProductVideo',
        targetId: req.params.productId,
        ...requestMeta(req),
      });
      sendData(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
