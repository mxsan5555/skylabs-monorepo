import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma-client';
import { notFound, conflict } from '../../lib/api-error';
import { requireAuth, type AuthedRequest } from '../../middleware/require-auth';
import { requireRole } from '../../middleware/require-role';
import { money } from '../../lib/money';
import { UserRole, type CancellationOutcome } from '../../generated/prisma';
import { hoursUntilBooking, computeCancellationOutcome } from './cancellation.service';

const cancelRequestSchema = z.object({
  reason: z.enum(['CHANGE_OF_PLANS', 'BOOKED_BY_MISTAKE', 'FOUND_BETTER_PRICE', 'PROVIDER_ISSUE', 'OTHER']),
  note: z.string().max(1000).optional(),
});

export const cancellationsRouter = Router();

cancellationsRouter.post('/me/order-items/:id/cancel', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = cancelRequestSchema.parse(req.body);
    const item = await prisma.orderItem.findUnique({ where: { id: req.params.id }, include: { order: true } });
    if (!item || item.order.userId !== req.auth!.id) throw notFound('order_item_not_found');
    if (item.itemStatus !== 'PENDING' && item.itemStatus !== 'CONFIRMED') throw conflict('ITEM_NOT_CANCELLABLE');

    const existing = await prisma.cancellation.findUnique({ where: { orderItemId: item.id } });
    if (existing) throw conflict('CANCELLATION_ALREADY_REQUESTED');

    const deal = await prisma.deal.findUnique({ where: { id: item.dealId }, include: { cancellationPolicy: true } });
    const policy = deal?.cancellationPolicy;
    const hoursUntil = hoursUntilBooking(item.bookingDate, item.bookingTime);
    const { outcome, refundPct } = policy
      ? computeCancellationOutcome(policy.freeCancelHoursBefore, policy.partialRefundPct, hoursUntil)
      : { outcome: 'NO_REFUND' as CancellationOutcome, refundPct: 0 };

    const policySnapshot = policy
      ? { freeCancelHoursBefore: policy.freeCancelHoursBefore, partialRefundPct: policy.partialRefundPct }
      : { freeCancelHoursBefore: 0, partialRefundPct: 0 };

    const refundAmount = Math.round((item.unitPriceAmount * item.quantity * refundPct) / 100);

    const [cancellation] = await prisma.$transaction([
      prisma.cancellation.create({
        data: {
          orderItemId: item.id,
          requestedByUserId: req.auth!.id,
          reason: input.reason,
          note: input.note,
          policySnapshot,
          outcome,
          status: 'APPROVED', // auto-approved — matches policy-driven outcome, no manual review needed
        },
      }),
      prisma.orderItem.update({ where: { id: item.id }, data: { itemStatus: 'CANCELLED' } }),
      ...(refundAmount > 0
        ? [
            prisma.refund.create({
              data: {
                orderId: item.orderId,
                orderItemId: item.id,
                amount: refundAmount,
                destination: 'ORIGINAL_METHOD',
                status: 'REQUESTED',
                reason: `Cancellation (${outcome})`,
              },
            }),
          ]
        : []),
    ]);

    // If every item on the order is now cancelled, the order itself is cancelled.
    const remaining = await prisma.orderItem.count({
      where: { orderId: item.orderId, itemStatus: { notIn: ['CANCELLED', 'REFUNDED'] } },
    });
    if (remaining === 0) {
      await prisma.order.update({ where: { id: item.orderId }, data: { status: 'CANCELLED' } });
    }

    res.status(201).json({
      id: cancellation.id,
      outcome: cancellation.outcome,
      status: cancellation.status,
      refundAmount: money(refundAmount),
    });
  } catch (err) {
    next(err);
  }
});

cancellationsRouter.get('/me/refunds', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const refunds = await prisma.refund.findMany({
      where: { order: { userId: req.auth!.id } },
      include: { order: { select: { orderNumber: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      items: refunds.map((r) => ({
        id: r.id,
        orderNumber: r.order.orderNumber,
        amount: money(r.amount),
        destination: r.destination,
        status: r.status,
        reason: r.reason,
        createdAt: r.createdAt,
        processedAt: r.processedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export const adminCancellationsRouter = Router();
const adminOnly = [UserRole.ADMIN];

adminCancellationsRouter.post(
  '/admin/refunds/:id/approve',
  requireAuth,
  requireRole(adminOnly),
  async (req, res, next) => {
    try {
      const refund = await prisma.refund.findUnique({ where: { id: req.params.id } });
      if (!refund) throw notFound('refund_not_found');
      const updated = await prisma.refund.update({
        where: { id: refund.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

adminCancellationsRouter.post(
  '/admin/refunds/:id/reject',
  requireAuth,
  requireRole(adminOnly),
  async (req, res, next) => {
    try {
      const refund = await prisma.refund.findUnique({ where: { id: req.params.id } });
      if (!refund) throw notFound('refund_not_found');
      const updated = await prisma.refund.update({ where: { id: refund.id }, data: { status: 'REJECTED' } });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

adminCancellationsRouter.post(
  '/admin/order-items/:id/cancel',
  requireAuth,
  requireRole(adminOnly),
  async (req, res, next) => {
    try {
      const item = await prisma.orderItem.findUnique({ where: { id: req.params.id } });
      if (!item) throw notFound('order_item_not_found');
      if (item.itemStatus === 'CANCELLED' || item.itemStatus === 'REFUNDED') throw conflict('ITEM_NOT_CANCELLABLE');

      await prisma.$transaction([
        prisma.orderItem.update({ where: { id: item.id }, data: { itemStatus: 'CANCELLED' } }),
        prisma.refund.create({
          data: {
            orderId: item.orderId,
            orderItemId: item.id,
            amount: item.unitPriceAmount * item.quantity,
            destination: 'ORIGINAL_METHOD',
            status: 'APPROVED',
            reason: 'Force-cancelled by admin (provider issue)',
          },
        }),
      ]);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);
