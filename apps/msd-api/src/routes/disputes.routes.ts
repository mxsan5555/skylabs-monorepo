import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { can } from '@skylabs-monorepo/shared-permissions';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { resolveGrantedPermissionKeys } from '../services/permission-resolver.service';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import { DisputeCreateSchema, DisputeListQuerySchema, DisputeResolveSchema } from '../schemas/dispute.schema';
import * as disputeService from '../services/dispute.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData, sendError } from '../lib/http';

/**
 * Two access surfaces on one router, same pattern as `orders.routes.ts`: `POST /` is customer
 * self-service (`authenticate` only — ownership of the targeted entitlement is checked in
 * `dispute.service.ts#raiseDispute`, "404 not 403" on a mismatch, same as every other customer
 * self-service route in this API). The admin list/detail/resolve surface is gated on the new
 * `accounts.refunds-disputes` key.
 */
const router = Router();
router.use(authenticate);

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

// ─── Customer self-service ────────────────────────────────────────────────────

router.post('/', validateBody(DisputeCreateSchema), async (req, res, next) => {
  try {
    const dispute = await disputeService.raiseDispute(req.user!.sub, req.body);
    await writeAuditLog({ actorUserId: req.user!.sub, action: 'dispute.raise', targetType: 'PurchaseDispute', targetId: dispute.id, after: dispute, ...requestMeta(req) });
    sendData(res, dispute, { status: 201 });
  } catch (err) {
    next(err);
  }
});

// ─── Admin review ─────────────────────────────────────────────────────────────

router.get('/', requirePermission('accounts.refunds-disputes', 'view'), validateQuery(DisputeListQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, status, vendorId } = req.validatedQuery as ReturnType<typeof DisputeListQuerySchema.parse>;
    const { items, total } = await disputeService.listDisputes({ page, pageSize, status, vendorId });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requirePermission('accounts.refunds-disputes', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, await disputeService.getDisputeOrThrow(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id/status',
  requirePermission('accounts.refunds-disputes', 'status_change'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      const dispute = await disputeService.markDisputeUnderReview(req.params.id);
      await writeAuditLog({ actorUserId: req.user!.sub, action: 'dispute.status_change', targetType: 'PurchaseDispute', targetId: dispute.id, after: dispute, ...requestMeta(req) });
      sendData(res, dispute);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * `resolutionType: REFUNDED` requires `approve` (the customer's claim is upheld); `NO_ACTION`/
 * `OTHER` require `reject` (reviewed and not upheld) — checked here rather than via
 * `requirePermission` directly since the required action depends on the request body, same
 * "resolve the needed action dynamically" pattern as `vendors.routes.ts`'s `requireAnyPermission`.
 */
async function requireResolvePermission(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    sendError(res, 'UNAUTHORIZED', 'Authentication required');
    return;
  }
  const action = req.body?.resolutionType === 'REFUNDED' ? 'approve' : 'reject';
  try {
    const granted = await resolveGrantedPermissionKeys(req.user.roles);
    if (!can(granted, 'accounts.refunds-disputes', action)) {
      sendError(res, 'FORBIDDEN', `Missing permission accounts.refunds-disputes:${action}`);
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}

router.post(
  '/:id/resolve',
  validateParams(UuidParamSchema),
  validateBody(DisputeResolveSchema),
  requireResolvePermission,
  async (req, res, next) => {
    try {
      const dispute = await disputeService.resolveDispute(req.user!.sub, req.params.id, req.body);
      await writeAuditLog({ actorUserId: req.user!.sub, action: 'dispute.resolve', targetType: 'PurchaseDispute', targetId: dispute.id, after: dispute, ...requestMeta(req) });
      sendData(res, dispute);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
