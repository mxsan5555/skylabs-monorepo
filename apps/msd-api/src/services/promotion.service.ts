import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma } from '../generated/prisma-client';
import * as mediaService from './media.service';
import type { MediaFile } from './media.service';
import type { PromotionCreateSchema, PromotionUpdateSchema } from '../schemas/promotion.schema';
import { PROMOTION_ROUTE_ALLOW_LIST } from '../schemas/promotion.schema';

type CreateInput = z.infer<typeof PromotionCreateSchema>;
type UpdateInput = z.infer<typeof PromotionUpdateSchema>;

/**
 * Home page "Promotions" admin CRUD — mirrors `popular-treatment.service.ts`'s exact shape
 * (no slug here, an admin-facing internal card has no public single-item URL of its own).
 * `destinationType` drives which of `destinationRoute`/`categoryId`/`dealId` is meaningful —
 * validated here (not just at the zod layer) since an update's schema is a plain partial and
 * re-checks the cross-field rule against the merged (existing + patch) record.
 */

const PROMOTION_INCLUDE = {
  category: { select: { id: true, name: true, slug: true, isActive: true } },
  deal: { select: { id: true, title: true, slug: true, status: true, approvalStatus: true } },
  mediaImages: { orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.PromotionInclude;

function assertDestinationShape(data: {
  destinationType: 'ROUTE' | 'CATEGORY' | 'DEAL';
  destinationRoute?: string | null;
  categoryId?: string | null;
  dealId?: string | null;
}) {
  if (data.destinationType === 'ROUTE') {
    if (!data.destinationRoute) throw new ApiError('VALIDATION_ERROR', 'destinationRoute is required when destinationType is ROUTE');
    if (!(PROMOTION_ROUTE_ALLOW_LIST as readonly string[]).includes(data.destinationRoute)) {
      throw new ApiError('VALIDATION_ERROR', `destinationRoute must be one of the allowed internal routes`);
    }
  } else if (data.destinationType === 'CATEGORY') {
    if (!data.categoryId) throw new ApiError('VALIDATION_ERROR', 'categoryId is required when destinationType is CATEGORY');
  } else if (data.destinationType === 'DEAL') {
    if (!data.dealId) throw new ApiError('VALIDATION_ERROR', 'dealId is required when destinationType is DEAL');
  }
}

async function assertCategoryExists(categoryId: string) {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) throw new ApiError('VALIDATION_ERROR', 'Selected category does not exist');
}

async function assertDealExists(dealId: string) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new ApiError('VALIDATION_ERROR', 'Selected deal does not exist');
}

export async function listPromotions(opts: { page: number; pageSize: number; search?: string }) {
  const where: Prisma.PromotionWhereInput = opts.search
    ? { title: { contains: opts.search, mode: 'insensitive' as const } }
    : {};
  const [items, total] = await Promise.all([
    prisma.promotion.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: PROMOTION_INCLUDE,
    }),
    prisma.promotion.count({ where }),
  ]);
  return { items, total };
}

export async function getPromotionOrThrow(id: string) {
  const promotion = await prisma.promotion.findUnique({ where: { id }, include: PROMOTION_INCLUDE });
  if (!promotion) throw new ApiError('NOT_FOUND', 'Promotion not found');
  return promotion;
}

export async function createPromotion(input: CreateInput) {
  assertDestinationShape(input);
  if (input.destinationType === 'CATEGORY' && input.categoryId) await assertCategoryExists(input.categoryId);
  if (input.destinationType === 'DEAL' && input.dealId) await assertDealExists(input.dealId);
  return prisma.promotion.create({
    data: input as Prisma.PromotionUncheckedCreateInput,
    include: PROMOTION_INCLUDE,
  });
}

export async function updatePromotion(id: string, input: UpdateInput) {
  const existing = await getPromotionOrThrow(id);
  const merged = {
    destinationType: input.destinationType ?? existing.destinationType,
    destinationRoute: input.destinationRoute !== undefined ? input.destinationRoute : existing.destinationRoute,
    categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
    dealId: input.dealId !== undefined ? input.dealId : existing.dealId,
  };
  assertDestinationShape(merged);
  if (merged.destinationType === 'CATEGORY' && merged.categoryId) await assertCategoryExists(merged.categoryId);
  if (merged.destinationType === 'DEAL' && merged.dealId) await assertDealExists(merged.dealId);
  if (input.startDate !== undefined || input.endDate !== undefined) {
    const startDate = input.startDate !== undefined ? input.startDate : existing.startDate;
    const endDate = input.endDate !== undefined ? input.endDate : existing.endDate;
    if (startDate && endDate && startDate > endDate) {
      throw new ApiError('VALIDATION_ERROR', 'startDate must be on or before endDate');
    }
  }
  return prisma.promotion.update({
    where: { id },
    data: input as Prisma.PromotionUncheckedUpdateInput,
    include: PROMOTION_INCLUDE,
  });
}

export async function setPromotionStatus(id: string, isActive: boolean) {
  await getPromotionOrThrow(id);
  return prisma.promotion.update({ where: { id }, data: { isActive }, include: PROMOTION_INCLUDE });
}

export async function deletePromotion(id: string) {
  await getPromotionOrThrow(id);
  await prisma.promotion.delete({ where: { id } });
}

// ─── Media (shared upload system — see media.service.ts's doc comment) ─────────────────────

export async function addPromotionImage(promotionId: string, file: MediaFile) {
  await getPromotionOrThrow(promotionId);
  return mediaService.addImage('promotion', promotionId, file);
}

export async function deletePromotionImage(promotionId: string, imageId: string) {
  await getPromotionOrThrow(promotionId);
  return mediaService.deleteImage('promotion', promotionId, imageId);
}

export async function reorderPromotionImages(promotionId: string, orderedImageIds: string[]) {
  await getPromotionOrThrow(promotionId);
  return mediaService.reorderImages('promotion', promotionId, orderedImageIds);
}

export async function setPromotionPrimaryImage(promotionId: string, imageId: string) {
  await getPromotionOrThrow(promotionId);
  return mediaService.setPrimaryImage('promotion', promotionId, imageId);
}

// ─── Public ──────────────────────────────────────────────────────────────────────────────────

/** Public Home page read — only currently-active promotions inside their (optional) visibility
 *  window. Never trusts a caller-supplied status/visibility override — same hard-coded
 *  server-side filter discipline as `VISIBLE_DEAL_WHERE`/`blog-post.service.ts`'s public reads. */
export async function getPublicPromotions() {
  const now = new Date();
  const promotions = await prisma.promotion.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startDate: null }, { startDate: { lte: now } }] },
        { OR: [{ endDate: null }, { endDate: { gte: now } }] },
      ],
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    include: {
      category: { select: { id: true, name: true, slug: true } },
      deal: { select: { id: true, title: true, slug: true } },
      mediaImages: { orderBy: { sortOrder: 'asc' as const } },
    },
  });
  return promotions.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    buttonLabel: p.buttonLabel,
    destinationType: p.destinationType,
    destinationRoute: p.destinationRoute,
    category: p.category,
    deal: p.deal,
    image: p.mediaImages.find((img) => img.isPrimary)?.storageKey ?? p.mediaImages[0]?.storageKey ?? null,
  }));
}
