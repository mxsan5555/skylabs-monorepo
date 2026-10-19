import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { getPublicHomeHero, countEligibleSlides, MIN_ELIGIBLE_SLIDES } from './home-hero.service';

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

  it('every query includes the eligibility filter (isActive + VISIBLE_DEAL_WHERE on the linked deal) — never trusts a caller override', async () => {
    prismaMock.homeHeroSlide.findMany.mockResolvedValueOnce(slideRows(5, 'up'));
    await getPublicHomeHero('Uttar Pradesh');
    const call = prismaMock.homeHeroSlide.findMany.mock.calls[0][0];
    expect(call.where.isActive).toBe(true);
    expect(call.where.deal.is.status).toBe('ACTIVE');
    expect(call.where.deal.is.approvalStatus).toBe('APPROVED');
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
