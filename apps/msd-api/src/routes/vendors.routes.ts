import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { PermissionAction } from '@skylabs-monorepo/shared-types';
import { can } from '@skylabs-monorepo/shared-permissions';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { resolveGrantedPermissionKeys } from '../services/permission-resolver.service';
import { sendError } from '../lib/http';
import { validateBody, validateParams } from '../middleware/validate';
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
  VendorIdParamSchema,
} from '../schemas/vendor.schema';
import * as vendorService from '../services/vendor.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData } from '../lib/http';

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

router.get('/categories', async (_req, res, next) => {
  try {
    sendData(res, await vendorService.listCategories());
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
router.get('/users/search', requireAnyPermission('vendors', ['create', 'edit']), async (req, res, next) => {
  try {
    const { page, pageSize, q } = VendorUserSearchQuerySchema.parse(req.query);
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
router.get('/branches', requirePermission('vendors', 'view'), async (req, res, next) => {
  try {
    const { page, pageSize, search } = CrossVendorListQuerySchema.parse(req.query);
    const { items, total } = await vendorService.listAllBranches({ page, pageSize, search });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.get('/deals', requirePermission('vendors', 'view'), async (req, res, next) => {
  try {
    const { page, pageSize, search } = CrossVendorListQuerySchema.parse(req.query);
    const { items, total } = await vendorService.listAllDeals({ page, pageSize, search });
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

/**
 * Distinct customers who have ordered/booked from the caller's own vendor — for the vendor-facing
 * "Customers" screen. Derived entirely from existing Order/Booking rows (no new table); paginates
 * the merged distinct-customer list, not the raw Order/Booking rows.
 */
router.get('/me/customers', requirePermission('vendors', 'custom'), async (req, res, next) => {
  try {
    const { page, pageSize } = PaginationQuerySchema.parse(req.query);
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

// ─── Admin/SuperAdmin surface ─────────────────────────────────────────────────

router.get('/', requirePermission('vendors', 'view'), async (req, res, next) => {
  try {
    const { page, pageSize, search, status } = VendorListQuerySchema.parse(req.query);
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

/**
 * All of a vendor's therapists (active AND inactive, across every branch) for the admin's
 * vendor detail page. Deliberately read-only — create/update/status-change stay self-service-only
 * (`/me/branches/:branchId/therapists`, `/me/therapists/:therapistId[/status]`), which resolve the
 * vendor from the caller's own `ownerUserId` and so are unreachable by a non-owner admin. Gated on
 * the same `vendors:view` every other purely-admin vendor read in this file already uses — no new
 * permission key needed.
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
  async (req, res, next) => {
    try {
      const { page, pageSize } = PaginationQuerySchema.parse(req.query);
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

export default router;
