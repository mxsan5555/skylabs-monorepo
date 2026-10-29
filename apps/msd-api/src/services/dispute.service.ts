import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma } from '../generated/prisma-client';
import { notifySuperAdmins, notifyVendorOwner } from './notification.service';

/**
 * Purchase disputes — customer-raised, admin-reviewed. Scoped to ONE entitlement (never the
 * whole order/vendor) — opening a dispute forces only that entitlement's `settlementStatus` to
 * DISPUTED_BLOCKED, storing `preDisputeStatus` for restore (see PurchaseDispute's own schema doc
 * comment, and `resolveDispute` below).
 */

export async function raiseDispute(
  customerId: string,
  input: { entitlementId: string; reason: string; description?: string; evidenceStorageKey?: string },
) {
  const entitlement = await prisma.purchaseEntitlement.findUnique({ where: { id: input.entitlementId } });
  // 404, never 403 — never confirms existence of an entitlement belonging to someone else (same
  // discipline as order.service.ts#getMyOrderOrThrow).
  if (!entitlement || entitlement.customerId !== customerId) {
    throw new ApiError('NOT_FOUND', 'Purchase not found');
  }
  if (entitlement.settlementStatus === 'DISPUTED_BLOCKED') {
    throw new ApiError('CONFLICT', 'A dispute is already open for this item');
  }

  const dispute = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseDispute.create({
      data: {
        orderItemId: entitlement.orderItemId,
        entitlementId: entitlement.id,
        customerId,
        reason: input.reason,
        description: input.description,
        evidenceStorageKey: input.evidenceStorageKey,
      },
    });
    await tx.purchaseEntitlement.update({
      where: { id: entitlement.id },
      data: { preDisputeStatus: entitlement.settlementStatus, settlementStatus: 'DISPUTED_BLOCKED' },
    });

    await notifyVendorOwner(tx, entitlement.vendorId, {
      type: 'DISPUTE_RAISED',
      title: 'Dispute Raised',
      message: `A customer raised a dispute on voucher ${entitlement.voucherCode}.`,
      entityType: 'PURCHASE_DISPUTE',
      entityId: created.id,
    });
    await notifySuperAdmins(tx, {
      type: 'DISPUTE_RAISED',
      title: 'Dispute Raised',
      message: `A customer raised a dispute on voucher ${entitlement.voucherCode}.`,
      entityType: 'PURCHASE_DISPUTE',
      entityId: created.id,
    });

    return created;
  });

  return dispute;
}

export async function listDisputes(opts: { page: number; pageSize: number; status?: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED'; vendorId?: string }) {
  const where = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.vendorId ? { entitlement: { is: { vendorId: opts.vendorId } } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.purchaseDispute.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: { entitlement: { select: { voucherCode: true, vendorId: true, grossAmount: true } }, customer: { select: { id: true, name: true } } },
    }),
    prisma.purchaseDispute.count({ where }),
  ]);
  return { items, total };
}

/**
 * Accounts Overview's "Refunds & disputes attention" tile — open-dispute count + the amount
 * already blocked by them. The blocked amount uses the SAME "payable" definition (memberShare +
 * any adjustments) `getAccountsOverview` already sums into `onHold` for `DISPUTED_BLOCKED`
 * entitlements — deliberately not a second, parallel definition — so the Overview page's own
 * copy ("blocked amounts are already counted inside On Hold, not double-counted") stays true.
 */
export async function getDisputeAttentionSummary() {
  const [openCount, blockedEntitlements] = await Promise.all([
    prisma.purchaseDispute.count({ where: { status: 'OPEN' } }),
    prisma.purchaseEntitlement.findMany({
      where: { settlementStatus: 'DISPUTED_BLOCKED' },
      select: { memberShareAmount: true, adjustments: { select: { amount: true } } },
    }),
  ]);

  const blockedAmount = blockedEntitlements.reduce(
    (sum, e) => sum.add(e.adjustments.reduce((s, a) => s.add(a.amount), new Prisma.Decimal(e.memberShareAmount))),
    new Prisma.Decimal(0),
  );

  return { openCount, blockedAmount };
}

export async function getDisputeOrThrow(id: string) {
  const dispute = await prisma.purchaseDispute.findUnique({
    where: { id },
    include: { entitlement: true, customer: { select: { id: true, name: true, phone: true, email: true } }, refunds: true },
  });
  if (!dispute) throw new ApiError('NOT_FOUND', 'Dispute not found');
  return dispute;
}

export async function markDisputeUnderReview(id: string) {
  const dispute = await getDisputeOrThrow(id);
  if (dispute.status !== 'OPEN') throw new ApiError('CONFLICT', `Cannot move a dispute from ${dispute.status} to UNDER_REVIEW`);
  return prisma.purchaseDispute.update({ where: { id }, data: { status: 'UNDER_REVIEW' } });
}

/**
 * `REFUNDED` just records the decision — the actual money movement is a separate `POST /refunds`
 * call (which sets the entitlement's final `settlementStatus`, see refund.service.ts). For
 * `NO_ACTION`/`OTHER`, this restores the entitlement's `settlementStatus` from the
 * `preDisputeStatus` snapshot taken when the dispute was raised, un-blocking it.
 */
export async function resolveDispute(
  adminUserId: string,
  id: string,
  input: { resolutionType: 'NO_ACTION' | 'REFUNDED' | 'OTHER'; resolutionNotes?: string },
) {
  const dispute = await getDisputeOrThrow(id);
  if (dispute.status === 'RESOLVED') throw new ApiError('CONFLICT', 'This dispute has already been resolved');

  return prisma.$transaction(async (tx) => {
    const resolved = await tx.purchaseDispute.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolutionType: input.resolutionType,
        resolutionNotes: input.resolutionNotes,
        resolvedAt: new Date(),
        resolvedByUserId: adminUserId,
      },
    });

    if (input.resolutionType !== 'REFUNDED' && dispute.entitlementId) {
      await tx.purchaseEntitlement.update({
        where: { id: dispute.entitlementId },
        data: { settlementStatus: dispute.entitlement?.preDisputeStatus ?? 'PENDING_FULFILMENT', preDisputeStatus: null },
      });
    }

    return resolved;
  });
}
