import { prisma } from '../../lib/prisma-client';
import type { PaymentMethod } from '../../generated/prisma';

/** Idempotent: re-processing an already-captured payment is a no-op. Called from both
 *  the client-side confirm-payment fallback and the Razorpay webhook — whichever lands first wins. */
export async function markPaymentCaptured(
  providerOrderId: string,
  providerPaymentId: string,
  method: PaymentMethod | null,
) {
  const payment = await prisma.payment.findFirst({ where: { providerOrderId } });
  if (!payment || payment.status === 'CAPTURED') return payment;

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: { providerPaymentId, method: method ?? undefined, status: 'CAPTURED', capturedAt: new Date() },
    }),
    prisma.order.update({ where: { id: payment.orderId }, data: { status: 'CONFIRMED' } }),
    prisma.orderItem.updateMany({ where: { orderId: payment.orderId }, data: { itemStatus: 'CONFIRMED' } }),
  ]);

  const order = await prisma.order.findUnique({ where: { id: payment.orderId } });
  if (order) {
    // Purchase confirmed — clear whatever's left in the buyer's cart (checkout doesn't
    // clear it up front, so a dismissed/failed attempt doesn't lose the cart).
    const cart = await prisma.cart.findUnique({ where: { userId: order.userId } });
    if (cart) await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  }

  return prisma.payment.findUnique({ where: { id: payment.id } });
}

export async function markPaymentFailed(providerOrderId: string, reason: string) {
  const payment = await prisma.payment.findFirst({ where: { providerOrderId } });
  if (!payment || payment.status === 'CAPTURED') return payment;
  return prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'FAILED', failureReason: reason },
  });
}
