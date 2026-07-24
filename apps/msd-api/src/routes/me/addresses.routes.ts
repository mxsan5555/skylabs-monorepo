import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthedRequest } from '../../middleware/require-auth';
import { prisma } from '../../lib/prisma-client';
import { notFound } from '../../lib/api-error';

const addressCreateSchema = z.object({
  label: z.string().min(1).max(60),
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().default('IN'),
  lat: z.number().optional(),
  lng: z.number().optional(),
  isDefault: z.boolean().default(false),
});
const addressUpdateSchema = addressCreateSchema.partial();

export const addressesRouter = Router();

async function clearOtherDefaults(userId: string, exceptId?: string) {
  await prisma.address.updateMany({
    where: { userId, id: exceptId ? { not: exceptId } : undefined },
    data: { isDefault: false },
  });
}

addressesRouter.get('/addresses', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const items = await prisma.address.findMany({ where: { userId: req.auth!.id }, orderBy: { createdAt: 'asc' } });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

addressesRouter.post('/addresses', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = addressCreateSchema.parse(req.body);
    if (input.isDefault) await clearOtherDefaults(req.auth!.id);
    const address = await prisma.address.create({ data: { ...input, userId: req.auth!.id } });
    res.status(201).json(address);
  } catch (err) {
    next(err);
  }
});

addressesRouter.patch('/addresses/:id', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = addressUpdateSchema.parse(req.body);
    const existing = await prisma.address.findFirst({ where: { id: req.params.id, userId: req.auth!.id } });
    if (!existing) throw notFound('address_not_found');
    if (input.isDefault) await clearOtherDefaults(req.auth!.id, existing.id);
    const address = await prisma.address.update({ where: { id: existing.id }, data: input });
    res.json(address);
  } catch (err) {
    next(err);
  }
});

addressesRouter.delete('/addresses/:id', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const existing = await prisma.address.findFirst({ where: { id: req.params.id, userId: req.auth!.id } });
    if (!existing) throw notFound('address_not_found');
    await prisma.address.delete({ where: { id: existing.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
