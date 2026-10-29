import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma } from '../generated/prisma-client';
import { createRazorpayRefund } from './payment.service';

/**
 * Admin-only refunds. `Refund.orderItemId` is the purchase line; `entitlementId` (required
 * whenever that line has more than one `PurchaseEntitlement` — a multi-quantity SERVICE line)
 * picks exactly which voucher's ledger the resulting `SettlementAdjustment` posts against — a
 * refund must never ambiguously apply to "the item" when it actually represents several
 * independent, independently-payable units.
 *
 * Refund BEFORE payout posts a `SettlementAdjustment(type: REFUND)` and, for a FULL refund,
 * moves the entitlement's `settlementStatus` to VOID (excluded from every Member Settlements/
 * Accounts Overview aggregate going forward) — a PARTIAL refund only reduces the payable amount
 * via the ledger, it never changes `settlementStatus`. Refund AFTER payout (the entitlement
 * already has a `payoutItemId`) posts a `SettlementAdjustment(type: RECOVERY)` instead and
 * leaves the original `MemberPayout` row completely untouched — history is never silently
 * rewritten (per the approved plan's explicit rule).
 */
export async function createRefund(
  adminUserId: string,
  input: { orderItemId: string; entitlementId?: string; amount: number; type: 'FULL' | 'PARTIAL'; reason?: string; disputeId?: string },
) {
  const orderItem = await prisma.orderItem.findUnique({ where: { id: input.orderItemId } });
  if (!orderItem) throw new ApiError('NOT_FOUND', 'Order item not found');

  const payment = await prisma.payment.findFirst({ where: { orderId: orderItem.orderId, status: 'PAID' }, orderBy: { createdAt: 'desc' } });
  if (!payment) throw new ApiError('CONFLICT', 'No successful payment found for this order to refund against');

  const entitlements = await prisma.purchaseEntitlement.findMany({ where: { orderItemId: input.orderItemId }, include: { adjustments: true } });
  let entitlement = entitlements[0];
  if (entitlements.length > 1) {
    if (!input.entitlementId) {
      throw new ApiError('VALIDATION_ERROR', 'This item has multiple vouchers — specify entitlementId');
    }
    const match = entitlements.find((e) => e.id === input.entitlementId);
    if (!match) throw new ApiError('NOT_FOUND', 'Entitlement not found for this order item');
    entitlement = match;
  } else if (!entitlement) {
    throw new ApiError('CONFLICT', 'No voucher exists yet for this order item — payment may not be confirmed');
  }

  const amount = new Prisma.Decimal(input.amount);
  const alreadyRefunded = entitlement.adjustments
    .filter((a) => a.type === 'REFUND' || a.type === 'RECOVERY')
    .reduce((sum, a) => sum.sub(a.amount), new Prisma.Decimal(0)); // adjustments are negative; flip sign
  const remaining = new Prisma.Decimal(entitlement.grossAmount).sub(alreadyRefunded);
  if (amount.gt(remaining)) {
    throw new ApiError('VALIDATION_ERROR', `Refund amount exceeds the remaining refundable amount (₹${remaining.toFixed(2)})`);
  }
  if (input.type === 'FULL' && !amount.equals(remaining)) {
    throw new ApiError('VALIDATION_ERROR', 'A FULL refund must equal the remaining refundable amount');
  }

  const amountPaise = Math.round(amount.toNumber() * 100);
  let providerRefundId: string | undefined;
  let status: 'PROCESSED' | 'PROCESSING' | 'FAILED' = 'PROCESSED';

  if (payment.provider === 'RAZORPAY') {
    if (!payment.providerPaymentId) throw new ApiError('CONFLICT', 'This payment has no captured provider payment id to refund');
    const providerRefund = await createRazorpayRefund(payment.providerPaymentId, amountPaise);
    providerRefundId = providerRefund.id;
    status = providerRefund.status === 'processed' ? 'PROCESSED' : 'PROCESSING';
  }
  // COD — no gateway involved; the admin is recording cash already physically returned, same
  // "manual record of something that already happened" convention as MemberPayout.

  const isPostPayout = entitlement.payoutItemId != null;
  const memberRatio = new Prisma.Decimal(entitlement.memberShareAmount).div(entitlement.grossAmount);
  const adjustmentAmount = amount.mul(memberRatio).toDecimalPlaces(2).neg();

  const result = await prisma.$transaction(async (tx) => {
    const refund = await tx.refund.create({
      data: {
        orderItemId: input.orderItemId,
        paymentId: payment.id,
        amount,
        type: input.type,
        reason: input.reason,
        disputeId: input.disputeId,
        status,
        providerRefundId,
        processedByUserId: adminUserId,
        processedAt: status === 'PROCESSED' ? new Date() : null,
      },
    });

    await tx.settlementAdjustment.create({
      data: {
        entitlementId: entitlement.id,
        type: isPostPayout ? 'RECOVERY' : 'REFUND',
        amount: adjustmentAmount,
        reason: input.reason,
        refundId: refund.id,
        createdByUserId: adminUserId,
      },
    });

    if (!isPostPayout) {
      if (input.type === 'FULL') {
        await tx.purchaseEntitlement.update({ where: { id: entitlement.id }, data: { settlementStatus: 'VOID', preDisputeStatus: null } });
      }
      // PARTIAL pre-payout: settlementStatus is left exactly as-is — only the ledger changes.
    }
    // Post-payout (RECOVERY): the entitlement's settlementStatus (PAID) and the original
    // MemberPayout row are both left completely untouched — history is never rewritten.

    if (input.disputeId) {
      const dispute = await tx.purchaseDispute.findUnique({ where: { id: input.disputeId } });
      if (dispute && dispute.status !== 'RESOLVED') {
        await tx.purchaseDispute.update({
          where: { id: input.disputeId },
          data: { status: 'RESOLVED', resolutionType: 'REFUNDED', resolvedAt: new Date(), resolvedByUserId: adminUserId },
        });
        if (!isPostPayout && input.type === 'PARTIAL') {
          await tx.purchaseEntitlement.update({
            where: { id: entitlement.id },
            data: { settlementStatus: entitlement.preDisputeStatus ?? 'PENDING_FULFILMENT', preDisputeStatus: null },
          });
        }
      }
    }

    return refund;
  });

  return result;
}

export async function listRefundsForOrderItem(orderItemId: string) {
  return prisma.refund.findMany({ where: { orderItemId }, orderBy: { createdAt: 'desc' } });
}
