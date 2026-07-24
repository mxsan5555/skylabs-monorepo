import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma-client';
import { money } from '../../lib/money';
import type { AuthedRequest } from '../../middleware/require-auth';
import type { Prisma } from '../../generated/prisma';

export const cartItemInclude = {
  deal: { include: { company: true } },
  pricingPlan: true,
  location: true,
} satisfies Prisma.CartItemInclude;

type CartWithItems = Prisma.CartGetPayload<{ include: { items: { include: typeof cartItemInclude } } }>;

/** Resolves (or creates) the caller's cart: by userId if authenticated, else by the
 *  X-Guest-Token header (a fresh token + cart are created if absent). */
export async function resolveCart(req: AuthedRequest): Promise<{ cart: CartWithItems; newGuestToken?: string }> {
  const include = { items: { include: cartItemInclude } };

  if (req.auth) {
    const existing = await prisma.cart.findUnique({ where: { userId: req.auth.id }, include });
    if (existing) return { cart: existing };
    const created = await prisma.cart.create({
      data: { userId: req.auth.id },
      include,
    });
    return { cart: created };
  }

  const headerToken = req.headers['x-guest-token'];
  const guestToken = typeof headerToken === 'string' ? headerToken : undefined;
  if (guestToken) {
    const existing = await prisma.cart.findUnique({ where: { guestToken }, include });
    if (existing) return { cart: existing };
  }
  const newGuestToken = crypto.randomUUID();
  const created = await prisma.cart.create({
    data: { guestToken: newGuestToken },
    include,
  });
  return { cart: created, newGuestToken };
}

export async function computeTotals(cart: CartWithItems) {
  const subtotal = cart.items.reduce((sum, i) => sum + i.priceSnapshotAmount * i.quantity, 0);
  const savings = cart.items.reduce((sum, i) => {
    const original = i.pricingPlan.originalPriceAmount;
    return sum + (original ? (original - i.priceSnapshotAmount) * i.quantity : 0);
  }, 0);

  let promoDiscount = 0;
  let promoError: string | null = null;
  if (cart.promoCode) {
    const promo = await prisma.promoCode.findUnique({ where: { code: cart.promoCode } });
    if (!promo || !promo.isActive || promo.validUntil < new Date()) {
      promoError = 'PROMO_INVALID';
    } else if (promo.minSubtotalAmount && subtotal < promo.minSubtotalAmount) {
      promoError = 'PROMO_NOT_ELIGIBLE';
    } else {
      promoDiscount =
        promo.kind === 'PERCENT'
          ? Math.min(Math.round((subtotal * promo.value) / 100), promo.maxDiscountAmount ?? Infinity)
          : promo.value;
    }
  }

  const afterPromo = Math.max(subtotal - promoDiscount, 0);

  let giftCardApplied = 0;
  let giftCardError: string | null = null;
  if (cart.giftCardCode) {
    const giftCard = await prisma.giftCard.findUnique({ where: { code: cart.giftCardCode } });
    if (!giftCard || giftCard.status !== 'ACTIVE' || (giftCard.expiresAt && giftCard.expiresAt < new Date())) {
      giftCardError = 'GIFT_CARD_INVALID';
    } else {
      giftCardApplied = Math.min(giftCard.balanceAmount, afterPromo);
    }
  }

  const payable = Math.max(afterPromo - giftCardApplied, 0);
  return {
    subtotal: money(subtotal),
    savings: money(savings),
    promoDiscount: money(promoDiscount),
    giftCardApplied: money(giftCardApplied),
    payable: money(payable),
    promoError,
    giftCardError,
    raw: { subtotal, savings, promoDiscount, giftCardApplied, payable },
  };
}

export async function toCartResponse(cart: CartWithItems) {
  const totals = await computeTotals(cart);
  return {
    id: cart.id,
    promoCode: cart.promoCode,
    giftCardCode: cart.giftCardCode,
    items: cart.items.map((i) => ({
      id: i.id,
      dealId: i.dealId,
      dealSlug: i.deal.slug,
      dealTitle: i.deal.title,
      heroImageUrl: i.deal.heroImageUrl,
      pricingPlanId: i.pricingPlanId,
      planName: i.pricingPlan.name,
      locationId: i.locationId,
      locationName: i.location.name,
      quantity: i.quantity,
      bookingDate: i.bookingDate,
      bookingTime: i.bookingTime,
      priceSnapshot: money(i.priceSnapshotAmount),
      originalPrice: i.pricingPlan.originalPriceAmount ? money(i.pricingPlan.originalPriceAmount) : null,
    })),
    subtotal: totals.subtotal,
    savings: totals.savings,
    promoDiscount: totals.promoDiscount,
    giftCardApplied: totals.giftCardApplied,
    payable: totals.payable,
    promoError: totals.promoError,
    giftCardError: totals.giftCardError,
  };
}
