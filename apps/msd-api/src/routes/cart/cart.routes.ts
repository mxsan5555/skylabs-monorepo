import { Router } from 'express';
import { prisma } from '../../lib/prisma-client';
import { notFound, conflict, badRequest } from '../../lib/api-error';
import { optionalAuth } from '../../middleware/optional-auth';
import type { AuthedRequest } from '../../middleware/require-auth';
import { registry } from '../../lib/openapi-registry';
import { cartItemAddSchema, cartItemUpdateSchema, promoApplySchema } from './cart.schemas';
import { resolveCart, toCartResponse, cartItemInclude } from './cart.service';

registry.registerPath({
  method: 'get',
  path: '/cart',
  summary: 'Current cart (user or guest, via X-Guest-Token)',
  responses: { 200: { description: 'Cart' } },
});
registry.registerPath({
  method: 'post',
  path: '/cart/items',
  summary: 'Add an item to the cart',
  request: { body: { content: { 'application/json': { schema: cartItemAddSchema } } } },
  responses: { 201: { description: 'Updated cart' } },
});

export const cartRouter = Router();

async function respondWithCart(req: AuthedRequest, res: import('express').Response, status = 200) {
  const { cart, newGuestToken } = await resolveCart(req);
  const body = await toCartResponse(cart);
  res.status(status).json(newGuestToken ? { ...body, guestToken: newGuestToken } : body);
}

cartRouter.get('/cart', optionalAuth, async (req: AuthedRequest, res, next) => {
  try {
    await respondWithCart(req, res);
  } catch (err) {
    next(err);
  }
});

cartRouter.post('/cart/items', optionalAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = cartItemAddSchema.parse(req.body);
    const { cart, newGuestToken } = await resolveCart(req);

    const deal = await prisma.deal.findUnique({
      where: { id: input.dealId },
      include: { pricingPlans: { orderBy: { sortOrder: 'asc' } }, locationLinks: true },
    });
    if (!deal || deal.status !== 'LIVE') throw notFound('deal_not_found');

    const plan = input.pricingPlanId
      ? deal.pricingPlans.find((p) => p.id === input.pricingPlanId && p.isActive)
      : deal.pricingPlans.find((p) => p.isActive);
    if (!plan) throw badRequest('pricing_plan_not_found');

    const locationId = input.locationId ?? deal.locationLinks[0]?.locationId;
    if (!locationId) throw badRequest('location_not_found');

    const existingItem = await prisma.cartItem.findFirst({
      where: { cartId: cart.id, dealId: deal.id, pricingPlanId: plan.id, locationId },
    });

    if (existingItem) {
      await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: Math.min(existingItem.quantity + input.quantity, 10),
          bookingDate: input.bookingDate ?? existingItem.bookingDate,
          bookingTime: input.bookingTime ?? existingItem.bookingTime,
        },
      });
    } else {
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          dealId: deal.id,
          pricingPlanId: plan.id,
          locationId,
          quantity: input.quantity,
          bookingDate: input.bookingDate,
          bookingTime: input.bookingTime,
          priceSnapshotAmount: plan.priceAmount,
        },
      });
    }

    const fresh = await prisma.cart.findUniqueOrThrow({
      where: { id: cart.id },
      include: { items: { include: cartItemInclude } },
    });
    const body = await toCartResponse(fresh);
    res.status(201).json(newGuestToken ? { ...body, guestToken: newGuestToken } : body);
  } catch (err) {
    next(err);
  }
});

cartRouter.patch('/cart/items/:id', optionalAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = cartItemUpdateSchema.parse(req.body);
    const { cart } = await resolveCart(req);
    const item = await prisma.cartItem.findFirst({ where: { id: req.params.id, cartId: cart.id } });
    if (!item) throw notFound('cart_item_not_found');
    await prisma.cartItem.update({ where: { id: item.id }, data: input });
    await respondWithCart(req, res);
  } catch (err) {
    next(err);
  }
});

cartRouter.delete('/cart/items/:id', optionalAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { cart } = await resolveCart(req);
    const item = await prisma.cartItem.findFirst({ where: { id: req.params.id, cartId: cart.id } });
    if (!item) throw notFound('cart_item_not_found');
    await prisma.cartItem.delete({ where: { id: item.id } });
    await respondWithCart(req, res);
  } catch (err) {
    next(err);
  }
});

cartRouter.delete('/cart', optionalAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { cart } = await resolveCart(req);
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await prisma.cart.update({ where: { id: cart.id }, data: { promoCode: null } });
    await respondWithCart(req, res);
  } catch (err) {
    next(err);
  }
});

cartRouter.post('/cart/promo', optionalAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { code } = promoApplySchema.parse(req.body);
    const { cart } = await resolveCart(req);
    const promo = await prisma.promoCode.findUnique({ where: { code: code.toUpperCase() } });
    if (!promo || !promo.isActive) throw conflict('PROMO_INVALID');
    await prisma.cart.update({ where: { id: cart.id }, data: { promoCode: promo.code } });
    await respondWithCart(req, res);
  } catch (err) {
    next(err);
  }
});

cartRouter.delete('/cart/promo', optionalAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { cart } = await resolveCart(req);
    await prisma.cart.update({ where: { id: cart.id }, data: { promoCode: null } });
    await respondWithCart(req, res);
  } catch (err) {
    next(err);
  }
});
