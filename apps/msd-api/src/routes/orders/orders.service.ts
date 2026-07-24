import { prisma } from '../../lib/prisma-client';
import { money } from '../../lib/money';
import type { Prisma } from '../../generated/prisma';

export const orderInclude = {
  items: true,
  payments: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.OrderInclude;

type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/** Unpaid orders auto-expire 30 min after creation — checked lazily on read
 *  rather than via a cron, since nothing user-visible depends on it being instant. */
export async function expireIfStale(order: OrderWithRelations): Promise<OrderWithRelations> {
  if (order.status === 'PENDING_PAYMENT' && order.expiresAt < new Date()) {
    return prisma.order.update({ where: { id: order.id }, data: { status: 'EXPIRED' }, include: orderInclude });
  }
  return order;
}

export function toOrderSummary(order: OrderWithRelations) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    placedAt: order.placedAt,
    payable: money(order.payableAmount),
    itemCount: order.items.length,
    items: order.items.map((i) => ({ dealTitle: i.dealTitle, quantity: i.quantity })),
  };
}

export function toOrderDetail(order: OrderWithRelations) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    contact: { name: order.contactName, phone: order.contactPhone, email: order.contactEmail },
    subtotal: money(order.subtotalAmount),
    savings: money(order.savingsAmount),
    promoDiscount: money(order.promoDiscountAmount),
    payable: money(order.payableAmount),
    promoCode: order.promoCode,
    placedAt: order.placedAt,
    expiresAt: order.expiresAt,
    items: order.items.map((i) => ({
      id: i.id,
      dealId: i.dealId,
      dealTitle: i.dealTitle,
      companyName: i.companyName,
      heroImageUrl: i.heroImageUrl,
      planName: i.planName,
      durationMinutes: i.durationMinutes,
      unitPrice: money(i.unitPriceAmount),
      originalPrice: i.originalPriceAmount ? money(i.originalPriceAmount) : null,
      locationName: i.locationName,
      addressLine: i.addressLine,
      quantity: i.quantity,
      bookingDate: i.bookingDate,
      bookingTime: i.bookingTime,
      voucherCode: i.voucherCode,
      itemStatus: i.itemStatus,
      redeemBy: i.redeemBy,
    })),
    payments: order.payments.map((p) => ({
      id: p.id,
      provider: p.provider,
      method: p.method,
      amount: money(p.amount),
      status: p.status,
      failureReason: p.failureReason,
      capturedAt: p.capturedAt,
    })),
  };
}
