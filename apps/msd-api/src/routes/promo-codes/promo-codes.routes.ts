import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma-client';
import { notFound, conflict } from '../../lib/api-error';
import { requireAuth } from '../../middleware/require-auth';
import { requireRole } from '../../middleware/require-role';
import { registry } from '../../lib/openapi-registry';
import { PromoKind, PromoScope, UserRole } from '../../generated/prisma';

const promoCreateSchema = z.object({
  code: z.string().min(3).max(30),
  kind: z.nativeEnum(PromoKind),
  value: z.number().int().min(1),
  maxDiscountAmount: z.number().int().positive().optional(),
  minSubtotalAmount: z.number().int().positive().optional(),
  scope: z.nativeEnum(PromoScope).default('ALL'),
  scopeId: z.string().optional(),
  firstOrderOnly: z.boolean().default(false),
  usageLimitTotal: z.number().int().positive().optional(),
  usageLimitPerUser: z.number().int().positive().optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime(),
  isActive: z.boolean().default(true),
});
const promoUpdateSchema = promoCreateSchema.partial().omit({ code: true });

registry.registerPath({
  method: 'get',
  path: '/admin/promo-codes',
  summary: 'List promo codes (admin, marketing)',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'List' } },
});
registry.registerPath({
  method: 'post',
  path: '/admin/promo-codes',
  summary: 'Create a promo code (admin, marketing)',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: promoCreateSchema } } } },
  responses: { 201: { description: 'Created' } },
});

export const promoCodesRouter = Router();
const staffRoles = [UserRole.ADMIN, UserRole.MARKETING];

promoCodesRouter.get('/admin/promo-codes', requireAuth, requireRole(staffRoles), async (_req, res, next) => {
  try {
    const items = await prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

promoCodesRouter.post('/admin/promo-codes', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const input = promoCreateSchema.parse(req.body);
    const code = input.code.toUpperCase();
    const existing = await prisma.promoCode.findUnique({ where: { code } });
    if (existing) throw conflict('promo_code_taken');
    const promo = await prisma.promoCode.create({
      data: { ...input, code, validFrom: input.validFrom ? new Date(input.validFrom) : undefined, validUntil: new Date(input.validUntil) },
    });
    res.status(201).json(promo);
  } catch (err) {
    next(err);
  }
});

promoCodesRouter.patch('/admin/promo-codes/:id', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const input = promoUpdateSchema.parse(req.body);
    const existing = await prisma.promoCode.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('promo_code_not_found');
    const promo = await prisma.promoCode.update({
      where: { id: req.params.id },
      data: { ...input, validUntil: input.validUntil ? new Date(input.validUntil) : undefined },
    });
    res.json(promo);
  } catch (err) {
    next(err);
  }
});

promoCodesRouter.delete('/admin/promo-codes/:id', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const existing = await prisma.promoCode.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('promo_code_not_found');
    await prisma.promoCode.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
