import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma-client';
import { notFound, forbidden, conflict } from '../../lib/api-error';
import { requireAuth, type AuthedRequest } from '../../middleware/require-auth';
import { requireRole } from '../../middleware/require-role';
import { cursorQuerySchema, encodeCursor, decodeCursor } from '../../lib/pagination';
import { UserRole } from '../../generated/prisma';
import { recomputeDealRating, recomputeCompanyRating, ratingBreakdown } from './reviews.service';

const reviewCreateSchema = z.object({
  orderItemId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(80).optional(),
  body: z.string().max(2000).optional(),
  photos: z.array(z.object({ url: z.string().url(), alt: z.string() })).max(5).default([]),
});
const reviewUpdateSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().max(80).optional(),
  body: z.string().max(2000).optional(),
});
const reportSchema = z.object({
  reason: z.enum(['SPAM', 'OFFENSIVE', 'FAKE', 'OFF_TOPIC', 'PERSONAL_INFO', 'OTHER']),
  note: z.string().max(1000).optional(),
});
const replySchema = z.object({ body: z.string().min(1).max(1000) });
const moderateSchema = z.object({ action: z.enum(['publish', 'hide', 'remove']) });

function toReviewResponse(review: {
  id: string;
  userName: string;
  userAvatarUrl: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  photos: unknown;
  status: string;
  createdAt: Date;
  reply: { body: string; createdAt: Date } | null;
}) {
  return {
    id: review.id,
    author: { name: review.userName, avatarUrl: review.userAvatarUrl },
    rating: review.rating,
    title: review.title,
    body: review.body,
    photos: review.photos,
    status: review.status,
    createdAt: review.createdAt,
    reply: review.reply,
  };
}

export const reviewsRouter = Router();

reviewsRouter.get('/deals/:slug/reviews', async (req, res, next) => {
  try {
    const query = cursorQuerySchema.parse(req.query);
    const deal = await prisma.deal.findUnique({ where: { slug: req.params.slug } });
    if (!deal) throw notFound('deal_not_found');
    const rating = req.query.rating ? Number(req.query.rating) : undefined;

    const reviews = await prisma.review.findMany({
      where: {
        dealId: deal.id,
        status: 'PUBLISHED',
        ...(rating ? { rating } : {}),
        ...(query.cursor ? { id: { lt: decodeCursor(query.cursor) } } : {}),
      },
      include: { reply: true },
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
    });
    const hasMore = reviews.length > query.limit;
    const page = reviews.slice(0, query.limit);
    res.json({
      items: page.map(toReviewResponse),
      nextCursor: hasMore ? encodeCursor(page[page.length - 1].id) : null,
      hasMore,
      breakdown: await ratingBreakdown({ dealId: deal.id }),
    });
  } catch (err) {
    next(err);
  }
});

reviewsRouter.get('/companies/:slug/reviews', async (req, res, next) => {
  try {
    const query = cursorQuerySchema.parse(req.query);
    const company = await prisma.company.findUnique({ where: { slug: req.params.slug } });
    if (!company) throw notFound('company_not_found');

    const reviews = await prisma.review.findMany({
      where: { companyId: company.id, status: 'PUBLISHED', ...(query.cursor ? { id: { lt: decodeCursor(query.cursor) } } : {}) },
      include: { reply: true },
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
    });
    const hasMore = reviews.length > query.limit;
    const page = reviews.slice(0, query.limit);
    res.json({
      items: page.map(toReviewResponse),
      nextCursor: hasMore ? encodeCursor(page[page.length - 1].id) : null,
      hasMore,
      breakdown: await ratingBreakdown({ companyId: company.id }),
    });
  } catch (err) {
    next(err);
  }
});

export const meReviewsRouter = Router();

meReviewsRouter.post('/reviews', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = reviewCreateSchema.parse(req.body);
    const item = await prisma.orderItem.findUnique({ where: { id: input.orderItemId }, include: { order: true } });
    if (!item || item.order.userId !== req.auth!.id || item.itemStatus !== 'REDEEMED') {
      throw forbidden('REVIEW_NOT_ELIGIBLE');
    }
    const existing = await prisma.review.findUnique({ where: { orderItemId: item.id } });
    if (existing) throw conflict('REVIEW_ALREADY_EXISTS');

    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.id } });
    const deal = await prisma.deal.findUniqueOrThrow({ where: { id: item.dealId } });

    const review = await prisma.review.create({
      data: {
        userId: req.auth!.id,
        userName: user.name ?? 'MSD user',
        userAvatarUrl: user.avatarUrl,
        dealId: item.dealId,
        companyId: deal.companyId,
        orderItemId: item.id,
        rating: input.rating,
        title: input.title,
        body: input.body,
        photos: input.photos,
      },
      include: { reply: true },
    });
    await Promise.all([recomputeDealRating(item.dealId), recomputeCompanyRating(deal.companyId)]);
    res.status(201).json(toReviewResponse(review));
  } catch (err) {
    next(err);
  }
});

meReviewsRouter.get('/reviews', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { userId: req.auth!.id, status: { not: 'REMOVED' } },
      include: { reply: true },
      orderBy: { createdAt: 'desc' },
    });
    const pendingItems = await prisma.orderItem.findMany({
      where: { order: { userId: req.auth!.id }, itemStatus: 'REDEEMED' },
    });
    const reviewedItemIds = new Set(reviews.map((r) => r.orderItemId));
    const pendingPrompts = pendingItems
      .filter((i) => !reviewedItemIds.has(i.id))
      .map((i) => ({ orderItemId: i.id, dealTitle: i.dealTitle, heroImageUrl: i.heroImageUrl }));

    res.json({ items: reviews.map(toReviewResponse), pendingPrompts });
  } catch (err) {
    next(err);
  }
});

meReviewsRouter.patch('/reviews/:id', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = reviewUpdateSchema.parse(req.body);
    const existing = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.auth!.id) throw notFound('review_not_found');
    const daysSince = (Date.now() - existing.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 30) throw forbidden('EDIT_WINDOW_EXPIRED');

    const review = await prisma.review.update({ where: { id: existing.id }, data: input, include: { reply: true } });
    await Promise.all([recomputeDealRating(existing.dealId), recomputeCompanyRating(existing.companyId)]);
    res.json(toReviewResponse(review));
  } catch (err) {
    next(err);
  }
});

meReviewsRouter.delete('/reviews/:id', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const existing = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.auth!.id) throw notFound('review_not_found');
    await prisma.review.update({ where: { id: existing.id }, data: { status: 'REMOVED' } });
    await Promise.all([recomputeDealRating(existing.dealId), recomputeCompanyRating(existing.companyId)]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export const reviewReportsRouter = Router();

reviewReportsRouter.post('/reviews/:id/report', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = reportSchema.parse(req.body);
    const review = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!review) throw notFound('review_not_found');
    const report = await prisma.reviewReport.create({
      data: { reviewId: review.id, reportedByUserId: req.auth!.id, reason: input.reason, note: input.note },
    });
    await prisma.review.update({ where: { id: review.id }, data: { status: 'PENDING' } });
    res.status(201).json(report);
  } catch (err) {
    next(err);
  }
});

export const adminReviewsRouter = Router();
const staffRoles = [UserRole.ADMIN, UserRole.MARKETING];

adminReviewsRouter.get('/admin/reviews', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : 'PENDING';
    const reviews = await prisma.review.findMany({
      where: { status: status as never },
      include: { reply: true, reports: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items: reviews });
  } catch (err) {
    next(err);
  }
});

adminReviewsRouter.post('/admin/reviews/:id/moderate', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const { action } = moderateSchema.parse(req.body);
    const review = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!review) throw notFound('review_not_found');
    const status = action === 'publish' ? 'PUBLISHED' : action === 'hide' ? 'HIDDEN' : 'REMOVED';
    const updated = await prisma.review.update({ where: { id: review.id }, data: { status } });
    await Promise.all([recomputeDealRating(review.dealId), recomputeCompanyRating(review.companyId)]);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

adminReviewsRouter.post('/admin/reviews/:id/reply', requireAuth, requireRole(staffRoles), async (req: AuthedRequest, res, next) => {
  try {
    const { body } = replySchema.parse(req.body);
    const review = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!review) throw notFound('review_not_found');
    const reply = await prisma.partnerReply.upsert({
      where: { reviewId: review.id },
      update: { body },
      create: { reviewId: review.id, authorUserId: req.auth!.id, body },
    });
    res.status(201).json(reply);
  } catch (err) {
    next(err);
  }
});
