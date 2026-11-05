import { describe, it, expect } from 'vitest';
import { hotIdsFrom, offerTag, tagWhere, TAG_RULES, type TagItem } from './offer-tag';

/** Evaluates the small Prisma `where` subset `tagWhere` emits against an in-memory item. */
type Where = Record<string, unknown>;
function matchesTagWhere(row: TagItem, where: Where): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'AND') return (cond as Where[]).every((w) => matchesTagWhere(row, w));
    if (key === 'OR') return (cond as Where[]).some((w) => matchesTagWhere(row, w));
    const field = key === 'discountPercent' ? 'discount' : key;
    const value = (row as unknown as Record<string, unknown>)[field] ?? null;
    if (cond === null) return value === null;
    const c = cond as Record<string, unknown>;
    const n = (v: unknown) => (v instanceof Date ? v.getTime() : Number(v));
    if (value === null) return false;
    return (
      (c.in === undefined || (c.in as unknown[]).includes(value)) &&
      (c.notIn === undefined || !(c.notIn as unknown[]).includes(value)) &&
      (c.gte === undefined || n(value) >= n(c.gte)) &&
      (c.gt === undefined || n(value) > n(c.gt)) &&
      (c.lte === undefined || n(value) <= n(c.lte)) &&
      (c.lt === undefined || n(value) < n(c.lt))
    );
  });
}

const now = new Date('2026-10-24T12:00:00Z');
const day = 24 * 60 * 60 * 1000;
const old = new Date(now.getTime() - 60 * day);
const item = (extra: Partial<TagItem> = {}): TagItem => ({ id: 'a', createdAt: old, endDate: null, discount: null, ...extra });

describe('offerTag (PLANNING §4 D30)', () => {
  it('Expire soon: a deal ending within 7 days wins over hot, new and 30% off', () => {
    const it2 = item({ endDate: new Date(now.getTime() + 3 * day), createdAt: now, discount: 50 });
    expect(offerTag(it2, new Set(['a']), now)).toBe('expire_soon');
  });

  it('an ended deal or one ending after 7 days is not Expire soon', () => {
    expect(offerTag(item({ endDate: new Date(now.getTime() - day) }), new Set(), now)).toBeNull();
    expect(offerTag(item({ endDate: new Date(now.getTime() + 8 * day) }), new Set(), now)).toBeNull();
  });

  it('Hot beats New and Deal', () => {
    expect(offerTag(item({ createdAt: now, discount: 40 }), new Set(['a']), now)).toBe('hot');
  });

  it('New is created within 14 days', () => {
    expect(offerTag(item({ createdAt: new Date(now.getTime() - 13 * day) }), new Set(), now)).toBe('new');
    expect(offerTag(item({ createdAt: new Date(now.getTime() - 15 * day) }), new Set(), now)).toBeNull();
  });

  it('Deal is 30% off or more', () => {
    expect(offerTag(item({ discount: 30 }), new Set(), now)).toBe('deal');
    expect(offerTag(item({ discount: 29 }), new Set(), now)).toBeNull();
  });
});

describe('hotIdsFrom', () => {
  it('keeps the top 10% (at least one) with 5 or more lines', () => {
    const lines = Array.from({ length: 20 }, (_, i) => ({ id: `d${i}`, count: 20 - i }));
    expect([...hotIdsFrom(lines)]).toEqual(['d0', 'd1']);
  });

  it('drops a top item below the minimum', () => {
    expect([...hotIdsFrom([{ id: 'x', count: TAG_RULES.hotMinLines - 1 }])]).toEqual([]);
    expect([...hotIdsFrom([{ id: 'x', count: TAG_RULES.hotMinLines }])]).toEqual(['x']);
  });
});

describe('tagWhere agrees with offerTag', () => {
  const hot = ['h'];
  const rows = [
    item({ id: 'exp', endDate: new Date(now.getTime() + day), createdAt: now }),
    item({ id: 'h', createdAt: now }),
    item({ id: 'n', createdAt: now }),
    item({ id: 'd', discount: 35 }),
    item({ id: 'nd', createdAt: now, discount: 35 }),
    item({ id: 'none' }),
  ];
  for (const kind of ['deal', 'product'] as const) {
    it(`each ${kind} matches exactly the where of its own tag`, () => {
      for (const row of rows) {
        const r = kind === 'product' ? { ...row, endDate: null } : row;
        const tag = offerTag(r, new Set(hot), now);
        for (const t of ['expire_soon', 'hot', 'new', 'deal'] as const) {
          expect(matchesTagWhere(r, tagWhere(t, kind, hot, now)), `${r.id} ${t}`).toBe(tag === t);
        }
      }
    });
  }

  it('products never get Expire soon', () => {
    expect(offerTag({ ...item({ endDate: new Date(now.getTime() + day) }), endDate: undefined }, new Set(), now)).toBeNull();
  });
});
