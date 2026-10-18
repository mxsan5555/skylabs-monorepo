import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { getPublicHomeHero, countEligibleSlides, createSlide, MIN_ELIGIBLE_SLIDES } from './home-hero.service';

const prismaMock = vi.mocked(prisma, true);

/** A minimal PUBLIC_DEAL_SELECT-shaped deal row — only the fields this service's own logic
 *  touches (id) actually matter for these tests; the rest is opaque pass-through. */
function dealRow(id: string) {
  return { id, title: `Deal ${id}` };
}

function slideRows(n: number, prefix = 's') {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, sortOrder: i, deal: dealRow(`d${prefix}${i}`) }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Feature: Home Hero — public read publish gate
 * Scenario: `MIN_ELIGIBLE_SLIDES` (5) is the hard floor for a slider — including the
 * Global/Default one — to ever be served publicly. Below that, the state falls back to
 * Global/Default; if even Global/Default isn't publishable, the response is an empty list
 * (never a partial/incomplete slider).
 */
describe('getPublicHomeHero — publish gate + fallback', () => {
  it('serves the requested state directly once it has >= MIN_ELIGIBLE_SLIDES eligible slides', async () => {
    expect(MIN_ELIGIBLE_SLIDES).toBe(5);
    prismaMock.homeHeroSlide.findMany.mockResolvedValueOnce(slideRows(5, 'up'));
    const result = await getPublicHomeHero('Uttar Pradesh');
    expect(result.state).toBe('Uttar Pradesh');
    expect(result.slides).toHaveLength(5);
    // Only one query needed — never falls through to Global/Default once the state itself qualifies.
    expect(prismaMock.homeHeroSlide.findMany).toHaveBeenCalledTimes(1);
  });

  it('falls back to the Global/Default slider when the requested state has fewer than 5 eligible slides', async () => {
    prismaMock.homeHeroSlide.findMany
      .mockResolvedValueOnce(slideRows(3, 'up')) // the requested state: only 3, not enough
      .mockResolvedValueOnce(slideRows(6, 'g')); // Global/Default: 6, enough
    const result = await getPublicHomeHero('Uttar Pradesh');
    expect(result.state).toBeNull();
    expect(result.slides).toHaveLength(6);
    expect(prismaMock.homeHeroSlide.findMany).toHaveBeenCalledTimes(2);
    // Second call must query state: null (Global/Default), not the originally-requested state.
    expect(prismaMock.homeHeroSlide.findMany.mock.calls[1][0].where.state).toBeNull();
  });

  it('returns an empty slide list when even the Global/Default slider is under the minimum', async () => {
    prismaMock.homeHeroSlide.findMany
      .mockResolvedValueOnce(slideRows(2, 'up'))
      .mockResolvedValueOnce(slideRows(4, 'g'));
    const result = await getPublicHomeHero('Uttar Pradesh');
    expect(result.state).toBeNull();
    expect(result.slides).toEqual([]);
  });

  it('with no state requested, checks only the Global/Default slider directly (no wasted query)', async () => {
    prismaMock.homeHeroSlide.findMany.mockResolvedValueOnce(slideRows(5, 'g'));
    const result = await getPublicHomeHero();
    expect(result.state).toBeNull();
    expect(result.slides).toHaveLength(5);
    expect(prismaMock.homeHeroSlide.findMany).toHaveBeenCalledTimes(1);
  });

  it('every query includes the eligibility filter (an active deal or an active product) — never trusts a caller override', async () => {
    prismaMock.homeHeroSlide.findMany.mockResolvedValueOnce(slideRows(5, 'up'));
    await getPublicHomeHero('Uttar Pradesh');
    const call = prismaMock.homeHeroSlide.findMany.mock.calls[0][0];
    expect(call.where.isActive).toBe(true);
    const [dealBranch, productBranch] = call.where.OR;
    expect(dealBranch.deal.is.status).toBe('ACTIVE');
    expect(dealBranch.deal.is.approvalStatus).toBe('APPROVED');
    expect(productBranch.product.is.isActive).toBe(true);
  });

  it('returns deal and product slides with their type', async () => {
    prismaMock.homeHeroSlide.findMany.mockResolvedValueOnce([
      ...slideRows(4, 'd').map((s) => ({ ...s, product: null })),
      { id: 'p0', sortOrder: 9, deal: null, product: { id: 'prod-1', name: 'Massage Oil' } },
    ]);
    const result = await getPublicHomeHero('Uttar Pradesh');
    expect(result.slides.map((s) => s.type)).toEqual(['deal', 'deal', 'deal', 'deal', 'product']);
    expect(result.slides[4]).toEqual({ id: 'p0', type: 'product', product: { id: 'prod-1', name: 'Massage Oil' } });
  });
});

describe('countEligibleSlides', () => {
  it('counts only isActive slides whose deal currently satisfies VISIBLE_DEAL_WHERE', async () => {
    prismaMock.homeHeroSlide.findMany.mockResolvedValue(slideRows(3, 'x'));
    const count = await countEligibleSlides('Delhi');
    expect(count).toBe(3);
    const call = prismaMock.homeHeroSlide.findMany.mock.calls[0][0];
    expect(call.where.state).toBe('Delhi');
    expect(call.where.isActive).toBe(true);
  });

  it('counts the Global/Default slider when state is null', async () => {
    prismaMock.homeHeroSlide.findMany.mockResolvedValue(slideRows(1, 'y'));
    await countEligibleSlides(null);
    const call = prismaMock.homeHeroSlide.findMany.mock.calls[0][0];
    expect(call.where.state).toBeNull();
  });
});

describe('createSlide (PLANNING §7)', () => {
  const PRODUCT_ID = 'a1a1a1a1-0000-4000-8000-000000000001';

  it('adds a product slide when the product belongs to the state', async () => {
    prismaMock.product.findFirst.mockResolvedValue({ id: PRODUCT_ID } as never);
    prismaMock.homeHeroSlide.findFirst.mockResolvedValue(null);
    prismaMock.homeHeroSlide.create.mockResolvedValue({ id: 's1', productId: PRODUCT_ID, deal: null, product: { isActive: true, vendor: { status: 'ACTIVE' } } } as never);
    await createSlide({ itemType: 'product', itemId: PRODUCT_ID, state: 'Uttar Pradesh', sortOrder: 0 });
    expect(prismaMock.product.findFirst.mock.calls[0][0]!.where).toMatchObject({
      id: PRODUCT_ID,
      vendor: { is: { branches: { some: { state: 'Uttar Pradesh', isActive: true } } } },
    });
    expect(prismaMock.homeHeroSlide.create.mock.calls[0][0].data).toMatchObject({ productId: PRODUCT_ID, dealId: null, state: 'Uttar Pradesh' });
  });

  it('refuses an item from another state with 422', async () => {
    prismaMock.deal.findFirst.mockResolvedValue(null);
    await expect(createSlide({ itemType: 'deal', itemId: PRODUCT_ID, state: 'Delhi', sortOrder: 0 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.homeHeroSlide.create).not.toHaveBeenCalled();
  });

  it('refuses the same item twice in one slider with 409', async () => {
    prismaMock.deal.findFirst.mockResolvedValue({ id: PRODUCT_ID } as never);
    prismaMock.homeHeroSlide.findFirst.mockResolvedValue({ id: 'existing' } as never);
    await expect(createSlide({ itemType: 'deal', itemId: PRODUCT_ID, state: null, sortOrder: 0 })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prismaMock.homeHeroSlide.findFirst.mock.calls[0][0]!.where).toEqual({ state: null, dealId: PRODUCT_ID });
  });
});
