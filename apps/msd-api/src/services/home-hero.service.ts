import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma } from '../generated/prisma-client';
import { VISIBLE_DEAL_WHERE, VISIBLE_PRODUCT_WHERE, PUBLIC_DEAL_SELECT, PUBLIC_PRODUCT_SELECT } from './catalog.service';
import { assertItemInState } from './state-catalog.service';
import type { HomeHeroSlideCreateSchema, HomeHeroSlideUpdateSchema } from '../schemas/home-hero.schema';

type CreateInput = z.infer<typeof HomeHeroSlideCreateSchema>;
type UpdateInput = z.infer<typeof HomeHeroSlideUpdateSchema>;

/**
 * Home hero slider (docs/msd/PLANNING.md §7). A slide is a live reference to one deal or one
 * product (CHECK `home_hero_slide_one_item`), in one state's slider or the Global/Default one
 * (`state: null`).
 *
 * A slider only serves publicly once it has this many currently-eligible slides: the slide is
 * active AND its item still passes the storefront bar (`VISIBLE_DEAL_WHERE` /
 * `VISIBLE_PRODUCT_WHERE`) at read time. Fewer is a valid draft; the public read falls back to
 * Global/Default instead (see `getPublicHomeHero`).
 */
export const MIN_ELIGIBLE_SLIDES = 5;

/** Active slide whose deal or product customers can see right now. */
const ELIGIBLE_SLIDE_WHERE = {
  isActive: true,
  OR: [{ deal: { is: VISIBLE_DEAL_WHERE } }, { product: { is: VISIBLE_PRODUCT_WHERE } }],
} satisfies Prisma.HomeHeroSlideWhereInput;

const PRIMARY_IMAGE = {
  orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
  take: 1,
  select: { storageKey: true },
};

const ADMIN_INCLUDE = {
  deal: {
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      salePrice: true,
      vendor: { select: { id: true, businessName: true, status: true } },
      branch: { select: { id: true, name: true, state: true, isActive: true } },
      mediaImages: PRIMARY_IMAGE,
    },
  },
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      price: true,
      image: true,
      vendor: { select: { id: true, businessName: true, status: true } },
      mediaImages: PRIMARY_IMAGE,
    },
  },
} satisfies Prisma.HomeHeroSlideInclude;

type AdminSlideRow = Prisma.HomeHeroSlideGetPayload<{ include: typeof ADMIN_INCLUDE }>;

type EligibilityFields = {
  deal: { status: string; vendor: { status: string }; branch: { isActive: boolean } } | null;
  product: { isActive: boolean; vendor: { status: string } } | null;
};

const lower = (value: string) => value.toLowerCase().replace(/_/g, ' ');

/** Why customers cannot see a slide's item right now, in the console's words; null when they can. */
export function ineligibleReason({ deal, product }: EligibilityFields): string | null {
  if (deal) {
    if (deal.vendor.status !== 'ACTIVE') return `Member is ${lower(deal.vendor.status)}`;
    if (!deal.branch.isActive) return 'Branch paused';
    if (deal.status !== 'ACTIVE') return `Deal is ${lower(deal.status)}`;
    return null;
  }
  if (!product) return 'Item removed';
  if (product.vendor.status !== 'ACTIVE') return `Member is ${lower(product.vendor.status)}`;
  if (!product.isActive) return 'Product is paused';
  return null;
}

/** Admin row: item type, thumbnail, price, and whether (or why not) customers can see the item. */
function toAdminSlide(row: AdminSlideRow) {
  const reason = ineligibleReason(row);
  return {
    ...row,
    itemType: row.dealId ? ('deal' as const) : ('product' as const),
    itemEligible: reason === null,
    ineligibleReason: reason,
    image: row.deal?.mediaImages?.[0]?.storageKey ?? row.product?.mediaImages?.[0]?.storageKey ?? row.product?.image ?? null,
    price: row.deal ? String(row.deal.salePrice) : row.product ? String(row.product.price) : null,
  };
}

export async function listSlides(opts: { page: number; pageSize: number; state?: string | null }) {
  // `state: undefined` (query param omitted) → every slide across every state; `state: null`
  // (explicitly requested) → only the Global/Default slider's own slides; `state: 'X'` → only X's.
  const where: Prisma.HomeHeroSlideWhereInput = opts.state === undefined ? {} : { state: opts.state };
  const [items, total] = await Promise.all([
    prisma.homeHeroSlide.findMany({
      where,
      orderBy: [{ state: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: ADMIN_INCLUDE,
    }),
    prisma.homeHeroSlide.count({ where }),
  ]);
  return { items: items.map(toAdminSlide), total };
}

export type SliderStatus = 'LIVE' | 'DRAFT' | 'EMPTY';

/**
 * One row per slider for the overview table (D28): Global / Default always first, then every
 * state with at least one slide, by name. Live = 5 or more eligible slides.
 */
export async function listSliderOverview() {
  const slides = await prisma.homeHeroSlide.findMany({
    select: {
      id: true,
      state: true,
      isActive: true,
      updatedAt: true,
      deal: { select: { status: true, vendor: { select: { status: true } }, branch: { select: { isActive: true } } } },
      product: { select: { isActive: true, vendor: { select: { status: true } } } },
    },
  });
  const byState = new Map<string | null, typeof slides>([[null, []]]);
  for (const slide of slides) byState.set(slide.state, [...(byState.get(slide.state) ?? []), slide]);
  const states = [...byState.keys()].filter((s): s is string => s !== null).sort();
  return [null, ...states].map((state) => {
    const rows = byState.get(state) ?? [];
    const eligibleCount = rows.filter((r) => r.isActive && ineligibleReason(r) === null).length;
    const updated = rows.reduce<Date | null>((max, r) => (!max || r.updatedAt > max ? r.updatedAt : max), null);
    return {
      state,
      status: (rows.length === 0 ? 'EMPTY' : eligibleCount >= MIN_ELIGIBLE_SLIDES ? 'LIVE' : 'DRAFT') as SliderStatus,
      eligibleCount,
      minimumRequired: MIN_ELIGIBLE_SLIDES,
      deals: rows.filter((r) => r.deal).length,
      products: rows.filter((r) => r.product).length,
      updatedAt: updated,
    };
  });
}

/** Saves a slider's whole order at once; `slideIds` must be exactly that slider's slides. */
export async function reorderSlides(state: string | null, slideIds: string[]) {
  const existing = await prisma.homeHeroSlide.findMany({ where: { state }, select: { id: true } });
  const ids = new Set(existing.map((s) => s.id));
  if (slideIds.length !== ids.size || new Set(slideIds).size !== slideIds.length || !slideIds.every((id) => ids.has(id))) {
    throw new ApiError('VALIDATION_ERROR', 'Send every slide of this slider exactly once, in the new order.');
  }
  await prisma.$transaction(
    slideIds.map((id, index) => prisma.homeHeroSlide.update({ where: { id }, data: { sortOrder: index } })),
  );
}

/** Every distinct state that currently has at least one slide configured (for the admin's state
 *  picker). Global/Default (`null`) is always a valid target and is handled by the frontend. */
export async function listConfiguredStates() {
  const rows = await prisma.homeHeroSlide.findMany({ distinct: ['state'], select: { state: true } });
  return rows.map((r) => r.state).filter((s): s is string => s !== null).sort();
}

/** How many of a state's (or Global/Default's, `state: null`) slides are eligible right now —
 *  the "n/5 eligible" figure on the admin screen. */
export async function countEligibleSlides(state: string | null): Promise<number> {
  const slides = await prisma.homeHeroSlide.findMany({ where: { state, ...ELIGIBLE_SLIDE_WHERE }, select: { id: true } });
  return slides.length;
}

export async function getSlideOrThrow(id: string) {
  const slide = await prisma.homeHeroSlide.findUnique({ where: { id }, include: ADMIN_INCLUDE });
  if (!slide) throw new ApiError('NOT_FOUND', 'Home Hero slide not found');
  return toAdminSlide(slide);
}

/** Choose the state first, then an item of that state; the same item only once per slider. */
export async function createSlide(input: CreateInput) {
  const state = input.state ?? null;
  await assertItemInState(input.itemType, input.itemId, state);
  const itemColumn = input.itemType === 'deal' ? 'dealId' : 'productId';
  const duplicate = await prisma.homeHeroSlide.findFirst({ where: { state, [itemColumn]: input.itemId }, select: { id: true } });
  if (duplicate) throw new ApiError('CONFLICT', `This ${input.itemType} is already in this slider.`);
  const created = await prisma.homeHeroSlide.create({
    data: {
      state,
      sortOrder: input.sortOrder ?? 0,
      dealId: input.itemType === 'deal' ? input.itemId : null,
      productId: input.itemType === 'product' ? input.itemId : null,
    },
    include: ADMIN_INCLUDE,
  });
  return toAdminSlide(created);
}

/** Only the order changes; to show another item, remove the slide and add the new one. */
export async function updateSlide(id: string, input: UpdateInput) {
  await getSlideOrThrow(id);
  const updated = await prisma.homeHeroSlide.update({ where: { id }, data: { sortOrder: input.sortOrder }, include: ADMIN_INCLUDE });
  return toAdminSlide(updated);
}

export async function setSlideStatus(id: string, isActive: boolean) {
  await getSlideOrThrow(id);
  const updated = await prisma.homeHeroSlide.update({ where: { id }, data: { isActive }, include: ADMIN_INCLUDE });
  return toAdminSlide(updated);
}

export async function deleteSlide(id: string) {
  await getSlideOrThrow(id);
  await prisma.homeHeroSlide.delete({ where: { id } });
}

// ─── Public ──────────────────────────────────────────────────────────────────────────────────

export type PublicHomeHeroSlide =
  | { id: string; type: 'deal'; deal: Prisma.DealGetPayload<{ select: typeof PUBLIC_DEAL_SELECT }> }
  | { id: string; type: 'product'; product: Prisma.ProductGetPayload<{ select: typeof PUBLIC_PRODUCT_SELECT }> };

async function publicSlidesForState(state: string | null): Promise<PublicHomeHeroSlide[]> {
  const slides = await prisma.homeHeroSlide.findMany({
    where: { state, ...ELIGIBLE_SLIDE_WHERE },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    select: { id: true, sortOrder: true, deal: { select: PUBLIC_DEAL_SELECT }, product: { select: PUBLIC_PRODUCT_SELECT } },
  });
  return slides.map((s): PublicHomeHeroSlide =>
    s.deal ? { id: s.id, type: 'deal', deal: s.deal } : { id: s.id, type: 'product', product: s.product! },
  );
}

/**
 * Public Home page hero read. Eligibility and the `MIN_ELIGIBLE_SLIDES` gate are re-checked on
 * every request; a caller can never override them.
 *
 * `state` given and has 5+ eligible slides → that state's slider.
 * Otherwise → the Global/Default slider (`state: null`), if IT has 5+ eligible slides.
 * Otherwise → an empty list (the storefront shows its single-deal spotlight instead).
 */
export async function getPublicHomeHero(state?: string | null) {
  if (state) {
    const stateSlides = await publicSlidesForState(state);
    if (stateSlides.length >= MIN_ELIGIBLE_SLIDES) {
      return { state, slides: stateSlides };
    }
  }
  const globalSlides = await publicSlidesForState(null);
  if (globalSlides.length >= MIN_ELIGIBLE_SLIDES) {
    return { state: null, slides: globalSlides };
  }
  return { state: null, slides: [] };
}
