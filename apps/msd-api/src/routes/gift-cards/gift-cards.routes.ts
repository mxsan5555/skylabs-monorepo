import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma-client';
import { notFound, conflict } from '../../lib/api-error';
import { requireAuth } from '../../middleware/require-auth';
import { requireRole } from '../../middleware/require-role';
import { optionalAuth } from '../../middleware/optional-auth';
import type { AuthedRequest } from '../../middleware/require-auth';
import { resolveCart, toCartResponse } from '../cart/cart.service';
import { UserRole } from '../../generated/prisma';

const giftCardIssueSchema = z.object({
  balanceAmount: z.number().int().positive(),
  recipientEmail: z.string().email().optional(),
  expiresAt: z.string().datetime().optional(),
});
const giftCardUpdateSchema = z.object({
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
});
const applySchema = z.object({ code: z.string().min(1) });

function randomGiftCardCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 12; i++) out += chars[crypto.randomInt(chars.length)];
  return `GIFT-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}

export const adminGiftCardsRouter = Router();
const staffRoles = [UserRole.ADMIN, UserRole.SALES];

adminGiftCardsRouter.get('/admin/gift-cards', requireAuth, requireRole(staffRoles), async (_req, res, next) => {
  try {
    const items = await prisma.giftCard.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

adminGiftCardsRouter.post('/admin/gift-cards', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const input = giftCardIssueSchema.parse(req.body);
    const giftCard = await prisma.giftCard.create({
      data: {
        code: randomGiftCardCode(),
        initialBalanceAmount: input.balanceAmount,
        balanceAmount: input.balanceAmount,
        recipientEmail: input.recipientEmail,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      },
    });
    res.status(201).json(giftCard);
  } catch (err) {
    next(err);
  }
});

adminGiftCardsRouter.patch('/admin/gift-cards/:id', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const input = giftCardUpdateSchema.parse(req.body);
    const existing = await prisma.giftCard.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('gift_card_not_found');
    const giftCard = await prisma.giftCard.update({ where: { id: existing.id }, data: input });
    res.json(giftCard);
  } catch (err) {
    next(err);
  }
});

export const cartGiftCardRouter = Router();

cartGiftCardRouter.post('/cart/gift-card', optionalAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { code } = applySchema.parse(req.body);
    const { cart } = await resolveCart(req);
    const giftCard = await prisma.giftCard.findUnique({ where: { code: code.toUpperCase() } });
    if (!giftCard || giftCard.status !== 'ACTIVE') throw conflict('GIFT_CARD_INVALID');
    await prisma.cart.update({ where: { id: cart.id }, data: { giftCardCode: giftCard.code } });
    const fresh = await resolveCart(req);
    res.json(await toCartResponse(fresh.cart));
  } catch (err) {
    next(err);
  }
});

cartGiftCardRouter.delete('/cart/gift-card', optionalAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { cart } = await resolveCart(req);
    await prisma.cart.update({ where: { id: cart.id }, data: { giftCardCode: null } });
    const fresh = await resolveCart(req);
    res.json(await toCartResponse(fresh.cart));
  } catch (err) {
    next(err);
  }
});
