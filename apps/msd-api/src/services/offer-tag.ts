/**
 * Card tags (PLANNING §4, decision D30): one per deal or product, first match wins —
 * Expire soon, Hot, New, Deal. `offerTag` labels an item; `tagWhere` is the same rule as a
 * Prisma `where`, so the `tags=` filter, the tag facet counts and the card always agree
 * (`offer-tag.test.ts` checks the two against each other).
 */
export const OFFER_TAGS = ['expire_soon', 'hot', 'new', 'deal'] as const;
export type OfferTagKey = (typeof OFFER_TAGS)[number];
export type TagKind = 'deal' | 'product';

export const TAG_RULES = {
  expireSoonDays: 7,
  hotWindowDays: 30,
  hotTopShare: 0.1,
  hotMinLines: 5,
  newDays: 14,
  dealMinDiscount: 30,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
export const daysFrom = (now: Date, days: number) => new Date(now.getTime() + days * DAY_MS);

/** What the rule reads. Products have no `endDate`. */
export interface TagItem {
  id: string;
  createdAt: Date;
  endDate?: Date | null;
  discount?: number | null;
}

export function offerTag(item: TagItem, hotIds: ReadonlySet<string>, now: Date): OfferTagKey | null {
  const end = item.endDate?.getTime();
  if (end !== undefined && end >= now.getTime() && end <= daysFrom(now, TAG_RULES.expireSoonDays).getTime()) return 'expire_soon';
  if (hotIds.has(item.id)) return 'hot';
  if (item.createdAt.getTime() >= daysFrom(now, -TAG_RULES.newDays).getTime()) return 'new';
  if ((item.discountPercent ?? 0) >= TAG_RULES.dealMinDiscount) return 'deal';
  return null;
}

/** Top `hotTopShare` (at least one) of the items that sold in the window, by paid order lines,
 *  keeping only those with `hotMinLines` or more. */
export function hotIdsFrom(lines: { id: string; count: number }[]): Set<string> {
  const ranked = [...lines].sort((a, b) => b.count - a.count);
  const top = ranked.slice(0, Math.max(1, Math.ceil(ranked.length * TAG_RULES.hotTopShare)));
  return new Set(top.filter((l) => l.count >= TAG_RULES.hotMinLines).map((l) => l.id));
}

/** Prisma `where` for items whose shown tag is `tag` (higher-priority tags excluded). */
export function tagWhere(tag: OfferTagKey, kind: TagKind, hotIds: string[], now: Date): Record<string, unknown> {
  const limit = daysFrom(now, TAG_RULES.expireSoonDays);
  const since = daysFrom(now, -TAG_RULES.newDays);
  const discountField = kind === 'deal' ? 'discountPercent' : 'discount';
  const isExpiring = { endDate: { gte: now, lte: limit } };
  const notExpiring = kind === 'deal' ? [{ OR: [{ endDate: null }, { endDate: { lt: now } }, { endDate: { gt: limit } }] }] : [];
  const notHot = { id: { notIn: hotIds } };
  switch (tag) {
    case 'expire_soon':
      return kind === 'deal' ? isExpiring : { id: { in: [] } };
    case 'hot':
      return { AND: [{ id: { in: hotIds } }, ...notExpiring] };
    case 'new':
      return { AND: [{ createdAt: { gte: since } }, notHot, ...notExpiring] };
    case 'deal':
      return { AND: [{ [discountField]: { gte: TAG_RULES.dealMinDiscount } }, { createdAt: { lt: since } }, notHot, ...notExpiring] };
  }
}

/** `where` fragment for a `tags=` selection: items showing any of the chosen tags. */
export function tagsWhere(tags: OfferTagKey[], kind: TagKind, hotIds: string[], now: Date) {
  return { OR: tags.map((t) => tagWhere(t, kind, hotIds, now)) };
}
