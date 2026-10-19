import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { can } from '@skylabs-monorepo/shared-permissions';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { MemberSettlementsQuerySchema, RecordPayoutSchema, VendorIdParamSchema, VendorCommissionRateUpdateSchema } from '../schemas/settlement.schema';
import * as settlementService from '../services/settlement.service';
import { getVendorByOwnerUserId } from '../services/vendor.service';
import { resolveGrantedPermissionKeys } from '../services/permission-resolver.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData, sendError } from '../lib/http';

/**
 * Member Settlements — vendor-wise aggregates, per-vendor detail (bank details, statement,
 * eligible items, payout history, audit trail), and payout recording. `POST /payouts` is the one
 * route in this whole domain gated by BOTH `requirePermission('accounts.member-settlements',
 * 'approve')` AND `requireSuperAdmin()` — see that middleware's own doc comment for why.
 */
const router = Router();
router.use(authenticate);

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

/**
 * Passes if the caller holds `accounts.member-settlements:view` (admin/super_admin — sees any
 * vendor) OR holds `vendor-portal.payments:view` AND is requesting their OWN vendorId, resolved
 * via `getVendorByOwnerUserId` — the same self-service ownership choke point every other
 * `/vendors/me/*` route uses (mirrors `orders.routes.ts`'s `requireOrdersOrVendorSelf`). This is
 * what lets the `vendor` role's "Earnings & Payouts" page call this same
 * `GET /settlements/members/:vendorId` admin route with its own vendor id, without granting the
 * admin-wide `accounts.member-settlements` permission or a parallel endpoint — no new permission
 * key, no response-shape change: `getMemberSettlementDetail` is already scoped to the one
 * `:vendorId` in the URL, so a vendor caller can never see another vendor's data this way; this
 * middleware only decides who may pass that one `:vendorId` check, same as before.
 */
function requireMemberSettlementsOrVendorSelf() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      sendError(res, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    try {
      const granted = await resolveGrantedPermissionKeys(req.user.roles);
      if (can(granted, 'accounts.member-settlements', 'view')) {
        next();
        return;
      }
      if (can(granted, 'vendor-portal.payments', 'view')) {
        const vendor = await getVendorByOwnerUserId(req.user.sub);
        if (vendor && vendor.id === req.params.vendorId) {
          next();
          return;
        }
      }
      sendError(res, 'FORBIDDEN', 'Missing permission accounts.member-settlements:view');
    } catch (err) {
      next(err);
    }
  };
}

router.get(
  '/members',
  requirePermission('accounts.member-settlements', 'view'),
  validateQuery(MemberSettlementsQuerySchema),
  async (req, res, next) => {
    try {
      const { page, pageSize, search, status } = req.validatedQuery as ReturnType<typeof MemberSettlementsQuerySchema.parse>;
      const { items, total } = await settlementService.listMemberSettlements({ page, pageSize, search, status });
      sendData(res, items, { meta: { total, page, pageSize } });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/members/:vendorId',
  validateParams(VendorIdParamSchema),
  requireMemberSettlementsOrVendorSelf(),
  async (req, res, next) => {
    try {
      sendData(res, await settlementService.getMemberSettlementDetail(req.params.vendorId));
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/members/:vendorId/commission-rate',
  requirePermission('accounts.member-settlements', 'status_change'),
  validateParams(VendorIdParamSchema),
  validateBody(VendorCommissionRateUpdateSchema),
  async (req, res, next) => {
    try {
      const updated = await settlementService.setVendorCommissionRate(req.params.vendorId, req.body.commissionRatePercent);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'vendor.commission_rate.update',
        targetType: 'Vendor',
        targetId: updated.id,
        after: { commissionRatePercent: updated.commissionRatePercent },
        ...requestMeta(req),
      });
      sendData(res, updated);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/members/:vendorId/payouts',
  // DELIBERATE double-gate — see middleware/requireSuperAdmin.ts's own doc comment for why this
  // is the one documented exception to this codebase's "no role ever hardcoded" rule.
  requirePermission('accounts.member-settlements', 'approve'),
  requireSuperAdmin(),
  validateParams(VendorIdParamSchema),
  validateBody(RecordPayoutSchema),
  async (req, res, next) => {
    try {
      const payout = await settlementService.recordMemberPayout(req.user!.sub, req.params.vendorId, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'settlement.payout.recorded',
        targetType: 'MEMBER_PAYOUT',
        targetId: payout.id,
        after: payout,
        ...requestMeta(req),
      });
      sendData(res, payout, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
