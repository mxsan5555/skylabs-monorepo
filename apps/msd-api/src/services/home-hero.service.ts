import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma } from '../generated/prisma-client';
import { VISIBLE_DEAL_WHERE, PUBLIC_DEAL_SELECT } from './catalog.service';
import type { HomeHeroSlideCreateSchema, HomeHeroSlideUpdateSchema } from '../schemas/home-hero.schema';

type CreateInput = z.infer<typeof HomeHeroSlideCreateSchema>;
type UpdateInput = z.infer<typeof HomeHeroSlideUpdateSchema>;

/**
 * A State's hero slider (or the Global/Default slider, `state: null`) only ever serves publicly
 * once it has this many currently-eligible slides — "eligible" meaning `isActive: true` AND the
 * referenced Deal still satisfies `VISIBLE_DEAL_WHERE` (status/approval/vendor/branch all still
 * good) at read time, not just at the moment the admin added the slide. An admin can save fewer
 * than this as a draft; the public read simply won't serve an incomplete state's slider — see
 * `getPublicHomeHero` below.
 */
export const MIN_ELIGIBLE_SLIDES = 5;

const ADMIN_INCLUDE = {
  deal: {
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      approvalStatus: true,
      vendor: { select: { id: true, businessName: true, status: true } },
      branch: { select: { id: true, name: true, state: true, isActive: true } },
    },
  },
} satisfies Prisma.HomeHeroSlideInclude;

function isDealEligible(deal: { status: string; approvalStatus: string; vendor: { status: string }; branch: { isActive: boolean } }): boolean {
  return deal.status === 'ACTIVE' && deal.approvalStatus === 'APPROVED' && deal.vendor.status === 'ACTIVE' && deal.branch.isActive;
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
  return {
    items: items.map((row) => ({ ...row, dealEligible: isDealEligible(row.deal) })),
    total,
  };
}

/** Every distinct state that currently has at least one slide configured (for the admin's state
 *  picker) — always includes `null` (Global/Default) as its own entry conceptually, handled
 *  separately by the frontend since it's always a valid target even with zero slides yet. */
export async function listConfiguredStates() {
  const rows = await prisma.homeHeroSlide.findMany({ distinct: ['state'], select: { state: true } });
  return rows.map((r) => r.state).filter((s): s is string => s !== null).sort();
}

/** How many of a state's (or Global/Default's, `state: null`) slides are currently eligible —
 *  the number the admin screen shows as "X/5 eligible". */
export async function countEligibleSlides(state: string | null): Promise<number> {
  const slides = await prisma.homeHeroSlide.findMany({
    where: { state, isActive: true, deal: { is: VISIBLE_DEAL_WHERE } },
    select: { id: true },
  });
  return slides.length;
}

export async function getSlideOrThrow(id: string) {
  const slide = await prisma.homeHeroSlide.findUnique({ where: { id }, include: ADMIN_INCLUDE });
  if (!slide) throw new ApiError('NOT_FOUND', 'Home Hero slide not found');
  return { ...slide, dealEligible: isDealEligible(slide.deal) };
}

async function assertDealExists(dealId: string) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new ApiError('VALIDATION_ERROR', 'Selected deal does not exist');
}

export async function createSlide(input: CreateInput) {
  await assertDealExists(input.dealId);
  const created = await prisma.homeHeroSlide.create({
    data: input as Prisma.HomeHeroSlideUncheckedCreateInput,
    include: ADMIN_INCLUDE,
  });
  return { ...created, dealEligible: isDealEligible(created.deal) };
}

export async function updateSlide(id: string, input: UpdateInput) {
  await getSlideOrThrow(id);
  if (input.dealId) await assertDealExists(input.dealId);
  const updated = await prisma.homeHeroSlide.update({
    where: { id },
    data: input as Prisma.HomeHeroSlideUncheckedUpdateInput,
    include: ADMIN_INCLUDE,
  });
  return { ...updated, dealEligible: isDealEligible(updated.deal) };
}

export async function setSlideStatus(id: string, isActive: boolean) {
  await getSlideOrThrow(id);
  const updated = await prisma.homeHeroSlide.update({ where: { id }, data: { isActive }, include: ADMIN_INCLUDE });
  return { ...updated, dealEligible: isDealEligible(updated.deal) };
}

export async function deleteSlide(id: string) {
  await getSlideOrThrow(id);
  await prisma.homeHeroSlide.delete({ where: { id } });
}

// ─── Public ──────────────────────────────────────────────────────────────────────────────────

async function publicSlidesForState(state: string | null) {
  const slides = await prisma.homeHeroSlide.findMany({
    where: { state, isActive: true, deal: { is: VISIBLE_DEAL_WHERE } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    select: { id: true, sortOrder: true, deal: { select: PUBLIC_DEAL_SELECT } },
  });
  return slides.map((s) => ({ id: s.id, deal: s.deal }));
}

/**
 * Public Home page hero slider read. Never trusts a caller-supplied override — eligibility
 * (`VISIBLE_DEAL_WHERE`) and the `MIN_ELIGIBLE_SLIDES` publish gate are both re-checked live,
 * every request, exactly like the Deal approval workflow's own read-time gating.
 *
 * `state` given and has 5+ eligible slides → that state's slider.
 * Otherwise → the Global/Default slider (`state: null`), if IT has 5+ eligible slides.
 * Otherwise → an empty list (frontend degrades to its pre-slider single-spotlight fallback,
 * never crashes on an empty response).
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
