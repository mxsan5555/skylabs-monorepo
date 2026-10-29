import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma, HomeTagSectionTag } from '../generated/prisma-client';
import { VISIBLE_DEAL_WHERE, PUBLIC_DEAL_SELECT } from './catalog.service';
import { assertItemInState } from './state-catalog.service';

/**
 * Home page tag sections — New / Deal / Hot Deal / Expire soon rails, one `HomeTagSection` per
 * state x tag (docs/msd/PLANNING.md §7.1). Deals are manually picked and ordered by the admin
 * (never computed from creation date, discount or `endDate`) — only eligibility (can customers
 * see this deal right now) is computed.
 *
 * A section publishes once it is enabled and has this many currently-eligible items. No
 * HomeHeroSlide-style 5-slide minimum: each tag rail is useful with a single deal, and the
 * admin's own manual curation is already the quality gate. Not configurable (no `SystemSetting`
 * table yet, D22) — a plain constant, same as the hero's `MIN_ELIGIBLE_SLIDES`.
 */
export const MIN_ELIGIBLE_ITEMS_PER_TAG_SECTION = 1;

export const TAG_TITLES: Record<HomeTagSectionTag, string> = {
  NEW: 'New',
  DEAL: 'Deal',
  HOT_DEAL: 'Hot Deal',
  EXPIRE_SOON: 'Expire Soon',
};

/** Order of the 4 rows on the admin state screen. */
export const ADMIN_TAG_ORDER: HomeTagSectionTag[] = ['NEW', 'DEAL', 'HOT_DEAL', 'EXPIRE_SOON'];

/** Order of the 4 rails on the storefront home page — deliberately different from
 *  `ADMIN_TAG_ORDER` (New, Hot Deal, Deal, Expire Soon; see PLANNING.md §7.1). */
export const STOREFRONT_TAG_ORDER: HomeTagSectionTag[] = ['NEW', 'HOT_DEAL', 'DEAL', 'EXPIRE_SOON'];

const lower = (value: string) => value.toLowerCase().replace(/_/g, ' ');

type EligibilityFields = {
  status: string;
  approvalStatus: string;
  endDate: Date | null;
  vendor: { status: string };
  branch: { isActive: boolean };
};

/**
 * Why customers cannot see an item's deal right now, in the console's words; null when they can.
 * Mirrors `home-hero.service.ts#ineligibleReason`'s deal checks exactly, plus one rule that only
 * applies to the Expire soon tag: the deal must have a future `endDate` — a deal with no end date
 * at all cannot be judged "approaching expiry" and is ineligible there (not just unflagged), per
 * the explicit 2026-10-28 decision. No arbitrary "N days until expiry" window.
 */
export function ineligibleReason(tag: HomeTagSectionTag, fields: EligibilityFields): string | null {
  if (fields.vendor.status !== 'ACTIVE') return `Member is ${lower(fields.vendor.status)}`;
  if (!fields.branch.isActive) return 'Branch paused';
  if (fields.status !== 'ACTIVE') return `Deal is ${lower(fields.status)}`;
  if (fields.approvalStatus !== 'APPROVED') return `Deal is ${lower(fields.approvalStatus)}`;
  if (tag === 'EXPIRE_SOON') {
    if (!fields.endDate) return 'No end date set';
    if (fields.endDate.getTime() <= Date.now()) return 'Already past its end date';
  }
  return null;
}

/** DB-level equivalent of `ineligibleReason(tag, ...) === null`, for counts and the public read. */
function eligibleDealWhere(tag: HomeTagSectionTag): Prisma.DealWhereInput {
  return {
    ...VISIBLE_DEAL_WHERE,
    ...(tag === 'EXPIRE_SOON' ? { endDate: { not: null, gt: new Date() } } : {}),
  };
}

const PRIMARY_IMAGE = {
  orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
  take: 1,
  select: { storageKey: true },
};

const ADMIN_ITEM_INCLUDE = {
  deal: {
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      approvalStatus: true,
      salePrice: true,
      discountPercent: true,
      endDate: true,
      vendor: { select: { id: true, businessName: true, status: true } },
      branch: { select: { id: true, name: true, state: true, isActive: true } },
      mediaImages: PRIMARY_IMAGE,
    },
  },
} satisfies Prisma.HomeTagSectionItemInclude;

type AdminItemRow = Prisma.HomeTagSectionItemGetPayload<{ include: typeof ADMIN_ITEM_INCLUDE }>;

/** Admin row: deal snapshot (title, price, discount, expiry), and whether (or why not) customers
 *  can see it right now, for this item's own section's tag. */
function toAdminItem(row: AdminItemRow, tag: HomeTagSectionTag) {
  const reason = ineligibleReason(tag, row.deal);
  return {
    ...row,
    itemEligible: reason === null,
    ineligibleReason: reason,
    image: row.deal.mediaImages[0]?.storageKey ?? null,
    price: String(row.deal.salePrice),
  };
}

export async function getSectionOrThrow(id: string) {
  const section = await prisma.homeTagSection.findUnique({ where: { id } });
  if (!section) throw new ApiError('NOT_FOUND', 'Home Tag section not found');
  return section;
}

/** How many of a section's items are eligible right now — the "n eligible" figure on the admin
 *  screen and the public read's publish gate. */
export async function countEligibleItems(sectionId: string): Promise<number> {
  const section = await getSectionOrThrow(sectionId);
  const items = await prisma.homeTagSectionItem.findMany({
    where: { homeTagSectionId: sectionId, deal: { is: eligibleDealWhere(section.tag) } },
    select: { id: true },
  });
  return items.length;
}

export async function listItems(sectionId: string) {
  const section = await getSectionOrThrow(sectionId);
  const items = await prisma.homeTagSectionItem.findMany({
    where: { homeTagSectionId: sectionId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    include: ADMIN_ITEM_INCLUDE,
  });
  return items.map((item) => toAdminItem(item, section.tag));
}

/** Add one deal to a section — manually chosen, never computed; the same deal cannot be added
 *  twice to one section, but may sit in several different sections (e.g. Deal AND Hot Deal). */
export async function addItem(sectionId: string, dealId: string) {
  const section = await getSectionOrThrow(sectionId);
  await assertItemInState('deal', dealId, section.state);
  const duplicate = await prisma.homeTagSectionItem.findFirst({
    where: { homeTagSectionId: sectionId, dealId },
    select: { id: true },
  });
  if (duplicate) throw new ApiError('CONFLICT', 'This deal is already in this section.');
  const count = await prisma.homeTagSectionItem.count({ where: { homeTagSectionId: sectionId } });
  const created = await prisma.homeTagSectionItem.create({
    data: { homeTagSectionId: sectionId, dealId, sortOrder: count },
    include: ADMIN_ITEM_INCLUDE,
  });
  return toAdminItem(created, section.tag);
}

export async function removeItem(itemId: string) {
  const item = await prisma.homeTagSectionItem.findUnique({ where: { id: itemId } });
  if (!item) throw new ApiError('NOT_FOUND', 'Home Tag section item not found');
  await prisma.homeTagSectionItem.delete({ where: { id: itemId } });
}

/** Saves a section's whole item order at once; `itemIds` must be exactly that section's items. */
export async function reorderItems(sectionId: string, itemIds: string[]) {
  const existing = await prisma.homeTagSectionItem.findMany({
    where: { homeTagSectionId: sectionId },
    select: { id: true },
  });
  const ids = new Set(existing.map((i) => i.id));
  if (itemIds.length !== ids.size || new Set(itemIds).size !== itemIds.length || !itemIds.every((id) => ids.has(id))) {
    throw new ApiError('VALIDATION_ERROR', 'Send every item of this section exactly once, in the new order.');
  }
  await prisma.$transaction(
    itemIds.map((id, index) => prisma.homeTagSectionItem.update({ where: { id }, data: { sortOrder: index } })),
  );
}

export type SectionStatus = 'LIVE' | 'DRAFT' | 'DISABLED';

/** The 4 fixed tag rows for one state (or Global/Default, `state: null`) — always all 4, even
 *  when the admin has never touched this state before (synthesized defaults, `id: null`,
 *  `isEnabled: false`); the Enabled switch upserts the real row on first use. */
export async function getSectionsForState(state: string | null) {
  const rows = await prisma.homeTagSection.findMany({
    where: { state },
    include: { _count: { select: { items: true } } },
  });
  const byTag = new Map(rows.map((r) => [r.tag, r]));
  return Promise.all(
    ADMIN_TAG_ORDER.map(async (tag) => {
      const row = byTag.get(tag);
      const eligibleCount = row ? await countEligibleItems(row.id) : 0;
      const status: SectionStatus = !row || !row.isEnabled ? 'DISABLED' : eligibleCount >= MIN_ELIGIBLE_ITEMS_PER_TAG_SECTION ? 'LIVE' : 'DRAFT';
      return {
        id: row?.id ?? null,
        state,
        tag,
        title: TAG_TITLES[tag],
        isEnabled: row?.isEnabled ?? false,
        itemCount: row?._count.items ?? 0,
        eligibleCount,
        minimumRequired: MIN_ELIGIBLE_ITEMS_PER_TAG_SECTION,
        status,
        updatedAt: row?.updatedAt ?? null,
      };
    }),
  );
}

/** Upserts the one (state, tag) row the Enabled switch controls — creating it on first use. */
export async function setSectionEnabled(state: string | null, tag: HomeTagSectionTag, isEnabled: boolean) {
  const existing = await prisma.homeTagSection.findFirst({ where: { state, tag } });
  if (existing) {
    return prisma.homeTagSection.update({ where: { id: existing.id }, data: { isEnabled } });
  }
  return prisma.homeTagSection.create({ data: { state, tag, isEnabled } });
}

/** Every distinct state that has at least one configured section (for the overview table and the
 *  admin's "New state" picker, same pattern as Home Hero's `listConfiguredStates`). */
export async function listConfiguredStates() {
  const rows = await prisma.homeTagSection.findMany({ distinct: ['state'], select: { state: true } });
  return rows.map((r) => r.state).filter((s): s is string => s !== null).sort();
}

/** One row per state for the overview table: Global/Default first, then every configured state,
 *  by name — how many of its 4 tags are enabled, and how many of those are actually live. */
export async function listOverview() {
  const sections = await prisma.homeTagSection.findMany({ include: { _count: { select: { items: true } } } });
  const byState = new Map<string | null, typeof sections>([[null, []]]);
  for (const section of sections) byState.set(section.state, [...(byState.get(section.state) ?? []), section]);
  const states = [...byState.keys()].filter((s): s is string => s !== null).sort();
  return Promise.all(
    [null, ...states].map(async (state) => {
      const rows = byState.get(state) ?? [];
      const enabledRows = rows.filter((r) => r.isEnabled);
      const liveFlags = await Promise.all(
        enabledRows.map(async (r) => (await countEligibleItems(r.id)) >= MIN_ELIGIBLE_ITEMS_PER_TAG_SECTION),
      );
      const updated = rows.reduce<Date | null>((max, r) => (!max || r.updatedAt > max ? r.updatedAt : max), null);
      return {
        state,
        sectionsEnabled: enabledRows.length,
        liveSections: liveFlags.filter(Boolean).length,
        updatedAt: updated,
      };
    }),
  );
}

// ─── Public ──────────────────────────────────────────────────────────────────────────────────

export interface PublicHomeTagSection {
  tag: HomeTagSectionTag;
  title: string;
  /** Which section actually served this tag — the visitor's own state, or Global/Default. */
  state: string | null;
  deals: Prisma.DealGetPayload<{ select: typeof PUBLIC_DEAL_SELECT }>[];
}

async function publicDealsForSection(sectionId: string, tag: HomeTagSectionTag) {
  const items = await prisma.homeTagSectionItem.findMany({
    where: { homeTagSectionId: sectionId, deal: { is: eligibleDealWhere(tag) } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    select: { deal: { select: PUBLIC_DEAL_SELECT } },
  });
  return items.map((item) => item.deal);
}

/**
 * Public Home page tag-section read, resolved independently per tag (docs/msd/PLANNING.md §7.1):
 *
 * - The visitor's state has its OWN configured row for this tag (enabled or not, eligible or
 *   not) → use exactly that, win or lose; a disabled or not-yet-eligible state row NEVER falls
 *   back to Global for that tag — the state has already taken a position on it.
 * - The visitor's state has no row at all for this tag (never configured) → fall back to
 *   Global/Default's row for that SAME tag.
 * - Either way, the resolved row only renders once it is enabled AND has >=1 eligible deal;
 *   otherwise that one tag is simply omitted (never a whole-state swap like the hero's).
 *
 * Eligibility and the minimum are re-checked on every request; a caller can never override them.
 */
export async function getPublicHomeTagSections(state?: string | null): Promise<PublicHomeTagSection[]> {
  const result: PublicHomeTagSection[] = [];
  for (const tag of STOREFRONT_TAG_ORDER) {
    const row = state
      ? (await prisma.homeTagSection.findUnique({ where: { state_tag: { state, tag } } })) ??
        (await prisma.homeTagSection.findFirst({ where: { state: null, tag } }))
      : await prisma.homeTagSection.findFirst({ where: { state: { equals: null }, tag } });
    if (!row || !row.isEnabled) continue;
    const deals = await publicDealsForSection(row.id, tag);
    if (deals.length >= MIN_ELIGIBLE_ITEMS_PER_TAG_SECTION) {
      result.push({ tag, title: TAG_TITLES[tag], state: row.state, deals });
    }
  }
  return result;
}
