import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma, type BannerSlot } from '../generated/prisma-client';
import * as mediaService from './media.service';
import type { MediaFile } from './media.service';
import type { PromotionCreateSchema, PromotionUpdateSchema } from '../schemas/promotion.schema';
import { PROMOTION_ROUTE_ALLOW_LIST } from '../schemas/promotion.schema';
import { VISIBLE_DEAL_WHERE, VISIBLE_PRODUCT_WHERE } from './catalog-visibility';
import { assertItemInState } from './state-catalog.service';

type CreateInput = z.infer<typeof PromotionCreateSchema>;
type UpdateInput = z.infer<typeof PromotionUpdateSchema>;
type Destination = 'ROUTE' | 'CATEGORY' | 'DEAL' | 'PRODUCT';

/**
 * CTA banners (the `Promotion` model; docs/msd/PLANNING.md §6). A banner belongs to one state's
 * set or the Global/Default set (`state: null`), carries M3 colour roles for its background and
 * button (D24), one image, and shows in one or more named slots (`PromotionPlacement`, D25).
 * `destinationType` drives which of `destinationRoute` / `categoryId` / `dealId` / `productId`
 * is meaningful; a deal or product must belong to the banner's state. An update re-checks these
 * rules against the merged (existing + patch) record.
 */

const PROMOTION_INCLUDE = {
  category: { select: { id: true, name: true, slug: true, isActive: true } },
  deal: { select: { id: true, title: true, slug: true, status: true, approvalStatus: true } },
  product: { select: { id: true, name: true, slug: true, isActive: true } },
  mediaImages: { orderBy: { sortOrder: 'asc' as const } },
  placements: { select: { slot: true }, orderBy: { slot: 'asc' as const } },
} satisfies Prisma.PromotionInclude;

/** One image per banner (PLANNING §6). */
export const MAX_BANNER_IMAGES = 1;

async function assertDestination(data: {
  destinationType: Destination;
  destinationRoute?: string | null;
  categoryId?: string | null;
  dealId?: string | null;
  productId?: string | null;
  state: string | null;
}) {
  switch (data.destinationType) {
    case 'ROUTE':
      if (!data.destinationRoute) throw new ApiError('VALIDATION_ERROR', 'destinationRoute is required when destinationType is ROUTE');
      if (!(PROMOTION_ROUTE_ALLOW_LIST as readonly string[]).includes(data.destinationRoute)) {
        throw new ApiError('VALIDATION_ERROR', 'destinationRoute must be one of the allowed internal routes');
      }
      return;
    case 'CATEGORY': {
      if (!data.categoryId) throw new ApiError('VALIDATION_ERROR', 'categoryId is required when destinationType is CATEGORY');
      const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
      if (!category) throw new ApiError('VALIDATION_ERROR', 'Selected category does not exist');
      return;
    }
    case 'DEAL':
      if (!data.dealId) throw new ApiError('VALIDATION_ERROR', 'dealId is required when destinationType is DEAL');
      return assertItemInState('deal', data.dealId, data.state);
    case 'PRODUCT':
      if (!data.productId) throw new ApiError('VALIDATION_ERROR', 'productId is required when destinationType is PRODUCT');
      return assertItemInState('product', data.productId, data.state);
  }
}

function placementsCreate(slots: BannerSlot[]) {
  return { create: [...new Set(slots)].map((slot) => ({ slot })) };
}

export async function listPromotions(opts: { page: number; pageSize: number; search?: string; state?: string | null }) {
  // `state: undefined` → every banner; `null` → Global/Default only; a name → that state only.
  const where: Prisma.PromotionWhereInput = {
    ...(opts.state === undefined ? {} : { state: opts.state }),
    ...(opts.search ? { title: { contains: opts.search, mode: 'insensitive' as const } } : {}),
  };
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
  if (!promotion) throw new ApiError('NOT_FOUND', 'Banner not found');
  return promotion;
}

export async function createPromotion(input: CreateInput) {
  const state = input.state ?? null;
  await assertDestination({ ...input, state });
  const { placements, ...fields } = input;
  return prisma.promotion.create({
    data: { ...fields, state, placements: placementsCreate(placements) } as Prisma.PromotionUncheckedCreateInput,
    include: PROMOTION_INCLUDE,
  });
}

export async function updatePromotion(id: string, input: UpdateInput) {
  const existing = await getPromotionOrThrow(id);
  const pick = <K extends keyof UpdateInput & keyof typeof existing>(key: K) =>
    input[key] !== undefined ? input[key] : existing[key];
  await assertDestination({
    destinationType: (input.destinationType ?? existing.destinationType) as Destination,
    destinationRoute: pick('destinationRoute') as string | null,
    categoryId: pick('categoryId') as string | null,
    dealId: pick('dealId') as string | null,
    productId: pick('productId') as string | null,
    state: (pick('state') as string | null) ?? null,
  });
  if (input.startDate !== undefined || input.endDate !== undefined) {
    const startDate = pick('startDate') as Date | null;
    const endDate = pick('endDate') as Date | null;
    if (startDate && endDate && startDate > endDate) {
      throw new ApiError('VALIDATION_ERROR', 'startDate must be on or before endDate');
    }
  }
  const { placements, ...fields } = input;
  return prisma.promotion.update({
    where: { id },
    data: {
      ...fields,
      ...(placements ? { placements: { deleteMany: {}, ...placementsCreate(placements) } } : {}),
    } as Prisma.PromotionUncheckedUpdateInput,
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
  if ((await prisma.promotionImage.count({ where: { promotionId } })) >= MAX_BANNER_IMAGES) {
    throw new ApiError('VALIDATION_ERROR', 'A banner has one image. Remove the current image first.');
  }
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

const PUBLIC_BANNER_INCLUDE = {
  category: { select: { slug: true } },
  deal: { select: { id: true } },
  product: { select: { id: true } },
  mediaImages: { orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.PromotionInclude;

type PublicBannerRow = Prisma.PromotionGetPayload<{ include: typeof PUBLIC_BANNER_INCLUDE }>;

function bannerHref(row: PublicBannerRow): string {
  if (row.destinationType === 'CATEGORY' && row.category) return `/category/${row.category.slug}`;
  if (row.destinationType === 'DEAL' && row.deal) return `/deal/${row.deal.id}`;
  if (row.destinationType === 'PRODUCT' && row.product) return `/products/${row.product.id}`;
  return row.destinationRoute ?? '/';
}

async function bannersFor(slot: BannerSlot, state: string | null) {
  const now = new Date();
  return prisma.promotion.findMany({
    where: {
      isActive: true,
      state,
      placements: { some: { slot } },
      // A deal or product banner shows only while the storefront shows its item.
      OR: [
        { destinationType: { in: ['ROUTE', 'CATEGORY'] } },
        { destinationType: 'DEAL', deal: { is: VISIBLE_DEAL_WHERE } },
        { destinationType: 'PRODUCT', product: { is: VISIBLE_PRODUCT_WHERE } },
      ],
      AND: [
        { OR: [{ startDate: null }, { startDate: { lte: now } }] },
        { OR: [{ endDate: null }, { endDate: { gte: now } }] },
      ],
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    include: PUBLIC_BANNER_INCLUDE,
  });
}

/**
 * Public banners for one slot: the visitor's state's banners, or the Global/Default ones when the
 * state has none for the slot (or the visitor has no location). Visibility is re-checked on every
 * request; a caller can never override it.
 */
export async function getPublicBanners(opts: { slot: BannerSlot; state: string | null }) {
  let rows = opts.state ? await bannersFor(opts.slot, opts.state) : [];
  if (rows.length === 0) rows = await bannersFor(opts.slot, null);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    buttonLabel: row.buttonLabel,
    backgroundRole: row.backgroundRole,
    buttonRole: row.buttonRole,
    href: bannerHref(row),
    image: row.mediaImages.find((img) => img.isPrimary)?.storageKey ?? row.mediaImages[0]?.storageKey ?? null,
  }));
}
