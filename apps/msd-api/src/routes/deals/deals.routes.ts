import { Router } from 'express';
import { prisma } from '../../lib/prisma-client';
import { slugify } from '../../lib/slugify';
import { notFound, conflict, badRequest } from '../../lib/api-error';
import { requireAuth } from '../../middleware/require-auth';
import { requireRole } from '../../middleware/require-role';
import { registry } from '../../lib/openapi-registry';
import { UserRole, type Prisma } from '../../generated/prisma';
import {
  dealCreateSchema,
  dealUpdateSchema,
  dealListQuerySchema,
  dealReviewActionSchema,
  availabilityQuerySchema,
} from './deals.schemas';
import { dealDetailInclude, toDealCard, toDealDetail, computeAvailability } from './deals.service';
import { encodeCursor, decodeCursor } from '../../lib/pagination';

registry.registerPath({
  method: 'get',
  path: '/deals',
  summary: 'Browse/search live deals',
  responses: { 200: { description: 'Deal list' } },
});
registry.registerPath({
  method: 'get',
  path: '/deals/{slug}',
  summary: 'Deal detail',
  responses: { 200: { description: 'Deal' }, 404: { description: 'Not found' } },
});
registry.registerPath({
  method: 'post',
  path: '/admin/deals',
  summary: 'Create a deal (admin)',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: dealCreateSchema } } } },
  responses: { 201: { description: 'Created' } },
});

export const dealsRouter = Router();

dealsRouter.get('/deals', async (req, res, next) => {
  try {
    const query = dealListQuerySchema.parse(req.query);
    const where: Prisma.DealWhereInput = { status: 'LIVE' };
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { shortDescription: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.category) where.categoryLinks = { some: { category: { slug: query.category } } };
    if (query.company) where.company = { slug: query.company };
    if (query.featured) where.isFeatured = true;
    if (query.features?.length) where.features = { hasEvery: query.features };
    if (query.priceMin != null || query.priceMax != null) {
      where.pricingPlans = {
        some: {
          isActive: true,
          ...(query.priceMin != null ? { priceAmount: { gte: query.priceMin * 100 } } : {}),
          ...(query.priceMax != null ? { priceAmount: { lte: query.priceMax * 100 } } : {}),
        },
      };
    }
    if (query.cursor) where.id = { lt: decodeCursor(query.cursor) };

    const orderBy: Prisma.DealOrderByWithRelationInput =
      query.sort === 'rating'
        ? { ratingAvg: 'desc' }
        : query.sort === 'newest'
          ? { publishedAt: 'desc' }
          : { soldCount: 'desc' };

    const deals = await prisma.deal.findMany({
      where,
      include: dealDetailInclude,
      orderBy: [orderBy, { id: 'desc' }],
      take: query.limit + 1,
    });
    const hasMore = deals.length > query.limit;
    const page = deals.slice(0, query.limit);
    let items = page.map(toDealCard);
    if (query.sort === 'price-asc') items = items.sort((a, b) => (a.plan?.price.amount ?? 0) - (b.plan?.price.amount ?? 0));
    if (query.sort === 'price-desc') items = items.sort((a, b) => (b.plan?.price.amount ?? 0) - (a.plan?.price.amount ?? 0));

    res.json({
      items,
      nextCursor: hasMore ? encodeCursor(page[page.length - 1].id) : null,
      hasMore,
    });
  } catch (err) {
    next(err);
  }
});

dealsRouter.get('/deals/:slug', async (req, res, next) => {
  try {
    const deal = await prisma.deal.findFirst({
      where: { slug: req.params.slug, status: { in: ['LIVE', 'SOLD_OUT'] } },
      include: dealDetailInclude,
    });
    if (!deal) throw notFound('deal_not_found');
    res.json(toDealDetail(deal));
  } catch (err) {
    next(err);
  }
});

dealsRouter.get('/deals/:slug/related', async (req, res, next) => {
  try {
    const deal = await prisma.deal.findFirst({
      where: { slug: req.params.slug },
      include: { categoryLinks: true },
    });
    if (!deal) throw notFound('deal_not_found');
    const primaryCategoryId = deal.categoryLinks.find((c) => c.isPrimary)?.categoryId;
    const related = await prisma.deal.findMany({
      where: {
        status: 'LIVE',
        id: { not: deal.id },
        ...(primaryCategoryId ? { categoryLinks: { some: { categoryId: primaryCategoryId } } } : {}),
      },
      include: dealDetailInclude,
      orderBy: { ratingAvg: 'desc' },
      take: Math.min(Number(req.query.limit) || 10, 10),
    });
    res.json({ items: related.map(toDealCard) });
  } catch (err) {
    next(err);
  }
});

dealsRouter.get('/deals/:slug/availability', async (req, res, next) => {
  try {
    const query = availabilityQuerySchema.parse(req.query);
    const deal = await prisma.deal.findFirst({
      where: { slug: req.params.slug },
      include: { pricingPlans: true, locationLinks: true },
    });
    if (!deal) throw notFound('deal_not_found');
    const plan = query.pricingPlanId
      ? deal.pricingPlans.find((p) => p.id === query.pricingPlanId)
      : deal.pricingPlans.filter((p) => p.isActive)[0];
    const locationId = query.locationId ?? deal.locationLinks[0]?.locationId;
    if (!plan || !locationId) throw badRequest('plan_or_location_missing');
    const result = await computeAvailability(locationId, plan.durationMinutes ?? 60, query.date);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export const adminDealsRouter = Router();
const staffRoles = [UserRole.ADMIN, UserRole.MARKETING];

adminDealsRouter.get('/admin/deals', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : undefined;
    const deals = await prisma.deal.findMany({
      where: status ? { status: status as Prisma.EnumDealStatusFilter['equals'] } : {},
      include: dealDetailInclude,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items: deals.map(toDealDetail) });
  } catch (err) {
    next(err);
  }
});

adminDealsRouter.get('/admin/deals/:id', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id }, include: dealDetailInclude });
    if (!deal) throw notFound('deal_not_found');
    res.json(toDealDetail(deal));
  } catch (err) {
    next(err);
  }
});

adminDealsRouter.post('/admin/deals', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const input = dealCreateSchema.parse(req.body);
    const slug = slugify(input.slug ?? input.title);
    const existing = await prisma.deal.findUnique({ where: { slug } });
    if (existing) throw conflict('deal_slug_taken');

    const deal = await prisma.deal.create({
      data: {
        slug,
        companyId: input.companyId,
        title: input.title,
        shortDescription: input.shortDescription,
        description: input.description,
        heroImageUrl: input.heroImageUrl,
        heroImageAlt: input.heroImageAlt,
        gallery: input.gallery,
        badge: input.badge,
        features: input.features,
        included: input.included,
        notIncluded: input.notIncluded,
        howToUse: input.howToUse,
        finePrint: input.finePrint,
        cancellationPolicyId: input.cancellationPolicyId,
        validFrom: input.validFrom ? new Date(input.validFrom) : undefined,
        validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
        redeemByDaysAfterPurchase: input.redeemByDaysAfterPurchase,
        maxPerCustomer: input.maxPerCustomer,
        totalInventory: input.totalInventory,
        isFeatured: input.isFeatured,
        metaTitle: input.metaTitle,
        metaDescription: input.metaDescription,
        pricingPlans: { create: input.pricingPlans.map(({ id: _id, ...p }) => p) },
        menuItems: { create: input.menuItems.map(({ id: _id, ...m }) => m) },
        categoryLinks: { create: input.categories },
        locationLinks: { create: input.locationIds.map((locationId) => ({ locationId })) },
      },
      include: dealDetailInclude,
    });
    res.status(201).json(toDealDetail(deal));
  } catch (err) {
    next(err);
  }
});

adminDealsRouter.patch('/admin/deals/:id', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const input = dealUpdateSchema.parse(req.body);
    const existing = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('deal_not_found');

    const { categories, locationIds, pricingPlans, menuItems, packages, ...scalars } = input;

    await prisma.$transaction(async (tx) => {
      await tx.deal.update({
        where: { id: existing.id },
        data: {
          ...scalars,
          validFrom: scalars.validFrom ? new Date(scalars.validFrom) : undefined,
          validUntil: scalars.validUntil ? new Date(scalars.validUntil) : undefined,
        },
      });

      if (categories) {
        await tx.dealCategory.deleteMany({ where: { dealId: existing.id } });
        await tx.dealCategory.createMany({ data: categories.map((c) => ({ ...c, dealId: existing.id })) });
      }
      if (locationIds) {
        await tx.dealLocation.deleteMany({ where: { dealId: existing.id } });
        await tx.dealLocation.createMany({ data: locationIds.map((locationId) => ({ locationId, dealId: existing.id })) });
      }
      if (pricingPlans) {
        const keepIds = pricingPlans.filter((p) => p.id).map((p) => p.id!);
        await tx.pricingPlan.deleteMany({ where: { dealId: existing.id, id: { notIn: keepIds } } });
        for (const p of pricingPlans) {
          const { id, ...data } = p;
          if (id) await tx.pricingPlan.update({ where: { id }, data });
          else await tx.pricingPlan.create({ data: { ...data, dealId: existing.id } });
        }
      }
      if (menuItems) {
        const keepIds = menuItems.filter((m) => m.id).map((m) => m.id!);
        await tx.menuItem.deleteMany({ where: { dealId: existing.id, id: { notIn: keepIds } } });
        for (const m of menuItems) {
          const { id, ...data } = m;
          if (id) await tx.menuItem.update({ where: { id }, data });
          else await tx.menuItem.create({ data: { ...data, dealId: existing.id } });
        }
      }
      if (packages) {
        const keepIds = packages.filter((p) => p.id).map((p) => p.id!);
        await tx.package.deleteMany({ where: { dealId: existing.id, id: { notIn: keepIds } } });
        for (const pkg of packages) {
          const { id, items, ...data } = pkg;
          if (id) {
            await tx.package.update({ where: { id }, data });
            await tx.packageItem.deleteMany({ where: { packageId: id } });
            await tx.packageItem.createMany({ data: items.map((i) => ({ ...i, packageId: id })) });
          } else {
            const created = await tx.package.create({ data: { ...data, dealId: existing.id } });
            await tx.packageItem.createMany({ data: items.map((i) => ({ ...i, packageId: created.id })) });
          }
        }
      }
    });

    const deal = await prisma.deal.findUniqueOrThrow({ where: { id: existing.id }, include: dealDetailInclude });
    res.json(toDealDetail(deal));
  } catch (err) {
    next(err);
  }
});

adminDealsRouter.post('/admin/deals/:id/review', requireAuth, requireRole(staffRoles), async (req, res, next) => {
  try {
    const { action } = dealReviewActionSchema.parse(req.body);
    const existing = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('deal_not_found');

    const nextStatus =
      action === 'publish' ? 'LIVE' : action === 'pause' ? 'PAUSED' : action === 'resume' ? 'LIVE' : 'ARCHIVED';
    const deal = await prisma.deal.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        publishedAt: action === 'publish' && !existing.publishedAt ? new Date() : undefined,
      },
      include: dealDetailInclude,
    });
    res.json(toDealDetail(deal));
  } catch (err) {
    next(err);
  }
});
