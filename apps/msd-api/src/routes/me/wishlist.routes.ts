import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthedRequest } from '../../middleware/require-auth';
import { prisma } from '../../lib/prisma-client';
import { dealDetailInclude, toDealCard } from '../deals/deals.service';

const syncSchema = z.object({ dealIds: z.array(z.string()).max(200) });

export const wishlistRouter = Router();

wishlistRouter.get('/wishlist', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const items = await prisma.wishlistItem.findMany({
      where: { userId: req.auth!.id },
      orderBy: { createdAt: 'desc' },
      include: { deal: { include: dealDetailInclude } },
    });
    res.json({ items: items.map((i) => toDealCard(i.deal)) });
  } catch (err) {
    next(err);
  }
});

wishlistRouter.put('/wishlist/:dealId', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await prisma.wishlistItem.upsert({
      where: { userId_dealId: { userId: req.auth!.id, dealId: req.params.dealId } },
      update: {},
      create: { userId: req.auth!.id, dealId: req.params.dealId },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

wishlistRouter.delete('/wishlist/:dealId', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await prisma.wishlistItem.deleteMany({ where: { userId: req.auth!.id, dealId: req.params.dealId } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

wishlistRouter.post('/wishlist/sync', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { dealIds } = syncSchema.parse(req.body);
    await prisma.$transaction(
      dealIds.map((dealId) =>
        prisma.wishlistItem.upsert({
          where: { userId_dealId: { userId: req.auth!.id, dealId } },
          update: {},
          create: { userId: req.auth!.id, dealId },
        }),
      ),
    );
    const items = await prisma.wishlistItem.findMany({
      where: { userId: req.auth!.id },
      orderBy: { createdAt: 'desc' },
      include: { deal: { include: dealDetailInclude } },
    });
    res.json({ items: items.map((i) => toDealCard(i.deal)) });
  } catch (err) {
    next(err);
  }
});
