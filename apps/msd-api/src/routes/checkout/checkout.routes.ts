import { Router } from 'express';
import { prisma } from '../../lib/prisma-client';
import { conflict, notConfigured } from '../../lib/api-error';
import { requireAuth, type AuthedRequest } from '../../middleware/require-auth';
import { registry } from '../../lib/openapi-registry';
import { checkoutRequestSchema } from './checkout.schemas';
import { resolveCart, computeTotals } from '../cart/cart.service';
import { computeAvailability } from '../deals/deals.service';
import { randomOrderNumber, randomVoucherCode } from '../../lib/slugify';
import { money } from '../../lib/money';
import { razorpayConfigured, createRazorpayOrder } from '../../lib/razorpay';
import { env } from '../../env';

registry.registerPath({
  method: 'post',
  path: '/checkout',
  summary: 'Convert the cart into an Order + Razorpay PaymentIntent (user only)',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: checkoutRequestSchema } } } },
  responses: {
    201: { description: 'Order + payment created' },
    409: { description: 'Cart changed or slot unavailable' },
    503: { description: 'Payment gateway not configured' },
  },
});

export const checkoutRouter = Router();

checkoutRouter.post('/checkout', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    if (!razorpayConfigured) throw notConfigured();

    const input = checkoutRequestSchema.parse(req.body);
    const { cart } = await resolveCart(req);
    if (cart.items.length === 0) throw conflict('CART_EMPTY');

    const byId = new Map(cart.items.map((i) => [i.id, i]));
    const bookingById = new Map(input.items.map((i) => [i.cartItemId, i]));

    for (const cartItemId of bookingById.keys()) {
      if (!byId.has(cartItemId)) throw conflict('CART_CHANGED');
    }

    // Re-validate each item: deal still live, plan active, slot still free.
    for (const item of cart.items) {
      const booking = bookingById.get(item.id);
      if (!booking) continue;
      if (item.deal.status !== 'LIVE' || !item.pricingPlan.isActive) throw conflict('CART_CHANGED');
      const availability = await computeAvailability(
        item.locationId,
        item.pricingPlan.durationMinutes ?? 60,
        booking.bookingDate,
      );
      const slot = availability.slots.find((s) => s.time === booking.bookingTime);
      if (!slot || !slot.available) throw conflict('SLOT_UNAVAILABLE');
    }

    const totals = await computeTotals(cart);

    const orderNumber = randomOrderNumber();
    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: req.auth!.id,
        contactName: input.contact.name,
        contactPhone: input.contact.phone,
        contactEmail: input.contact.email,
        subtotalAmount: totals.raw.subtotal,
        savingsAmount: totals.raw.savings,
        promoDiscountAmount: totals.raw.promoDiscount,
        giftCardAppliedAmount: totals.raw.giftCardApplied,
        giftCardCode: cart.giftCardCode,
        payableAmount: totals.raw.payable,
        promoCode: cart.promoCode,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        items: {
          create: cart.items
            .filter((i) => bookingById.has(i.id))
            .map((i) => {
              const booking = bookingById.get(i.id)!;
              return {
                dealId: i.dealId,
                dealTitle: i.deal.title,
                companyName: i.deal.company.displayName,
                heroImageUrl: i.deal.heroImageUrl,
                pricingPlanId: i.pricingPlanId,
                planName: i.pricingPlan.name,
                durationMinutes: i.pricingPlan.durationMinutes,
                unitPriceAmount: i.priceSnapshotAmount,
                originalPriceAmount: i.pricingPlan.originalPriceAmount,
                locationId: i.locationId,
                locationName: i.location.name,
                addressLine: i.location.line1,
                quantity: i.quantity,
                bookingDate: booking.bookingDate,
                bookingTime: booking.bookingTime,
                voucherCode: randomVoucherCode(),
                redeemBy: i.deal.redeemByDaysAfterPurchase
                  ? new Date(Date.now() + i.deal.redeemByDaysAfterPurchase * 24 * 60 * 60 * 1000)
                  : undefined,
              };
            }),
        },
      },
    });

    // Deducted at checkout (not on payment success) so the balance can't be spent twice
    // across concurrent checkouts. Known gap: if this order expires unpaid, the balance
    // isn't automatically restored — phase-2 scope, would need an expiry sweep job.
    if (cart.giftCardCode && totals.raw.giftCardApplied > 0) {
      await prisma.giftCard.updateMany({
        where: { code: cart.giftCardCode },
        data: { balanceAmount: { decrement: totals.raw.giftCardApplied } },
      });
      const giftCard = await prisma.giftCard.findUnique({ where: { code: cart.giftCardCode } });
      if (giftCard && giftCard.balanceAmount <= 0) {
        await prisma.giftCard.update({ where: { id: giftCard.id }, data: { status: 'DEPLETED' } });
      }
    }

    const rpOrder = await createRazorpayOrder(totals.raw.payable, orderNumber);
    await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: 'razorpay',
        providerOrderId: rpOrder.id,
        amount: totals.raw.payable,
        status: 'CREATED',
      },
    });

    res.status(201).json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      payment: {
        provider: 'razorpay',
        providerOrderId: rpOrder.id,
        amount: money(totals.raw.payable),
        keyId: env.razorpayKeyId,
      },
    });
  } catch (err) {
    next(err);
  }
});
