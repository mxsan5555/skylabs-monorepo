import { Router } from 'express';
import type { Request } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import { RefundCreateSchema } from '../schemas/refund.schema';
import * as refundService from '../services/refund.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData } from '../lib/http';

/**
 * Admin-only refund creation — gated on `accounts.refunds-disputes:approve` (money movement in
 * the customer's favour, same "approve" semantics as a dispute resolved REFUNDED). No live
 * payout-API integration exists for MEMBER payouts, but Razorpay customer refunds DO have a real
 * API (`payment.service.ts#createRazorpayRefund`) — used here when the underlying Payment was a
 * RAZORPAY capture with a `providerPaymentId`; a COD payment is recorded with no gateway call.
 */
const router = Router();
router.use(authenticate);

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

router.post('/', requirePermission('accounts.refunds-disputes', 'approve'), validateBody(RefundCreateSchema), async (req, res, next) => {
  try {
    const refund = await refundService.createRefund(req.user!.sub, req.body);
    await writeAuditLog({ actorUserId: req.user!.sub, action: 'refund.create', targetType: 'Refund', targetId: refund.id, after: refund, ...requestMeta(req) });
    sendData(res, refund, { status: 201 });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/order-item/:id',
  requirePermission('accounts.refunds-disputes', 'view'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      sendData(res, await refundService.listRefundsForOrderItem(req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

export default router;
