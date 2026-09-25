import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import {
  createPromotion,
  updatePromotion,
  getPublicPromotions,
} from './promotion.service';

const prismaMock = vi.mocked(prisma, true);

const PROMOTION_ID = 'promo-1';
const CATEGORY_ID = 'cat-1';
const DEAL_ID = 'deal-1';

const basePromotion = {
  id: PROMOTION_ID,
  title: 'Welcome Offer',
  description: null,
  buttonLabel: null,
  destinationType: 'ROUTE' as const,
  destinationRoute: '/explore',
  categoryId: null,
  dealId: null,
  sortOrder: 0,
  isActive: true,
  startDate: null,
  endDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  category: null,
  deal: null,
  mediaImages: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Feature: Promotion — destination validation
 * Scenario: `destinationType` dictates which of `destinationRoute`/`categoryId`/`dealId` must be
 * present and real — never trusts the caller to have gotten this right client-side (the zod
 * schema itself can't cross-check FK existence).
 */
describe('Promotion — destination validation', () => {
  it('createPromotion rejects destinationType=CATEGORY with no categoryId', async () => {
    await expect(
      createPromotion({ title: 'X', destinationType: 'CATEGORY' } as never),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.promotion.create).not.toHaveBeenCalled();
  });

  it('createPromotion rejects a categoryId that does not exist', async () => {
    prismaMock.category.findUnique.mockResolvedValue(null);
    await expect(
      createPromotion({ title: 'X', destinationType: 'CATEGORY', categoryId: CATEGORY_ID } as never),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.promotion.create).not.toHaveBeenCalled();
  });

  it('createPromotion rejects a dealId that does not exist', async () => {
    prismaMock.deal.findUnique.mockResolvedValue(null);
    await expect(
      createPromotion({ title: 'X', destinationType: 'DEAL', dealId: DEAL_ID } as never),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.promotion.create).not.toHaveBeenCalled();
  });

  it('createPromotion succeeds for a real category destination', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: CATEGORY_ID } as never);
    prismaMock.promotion.create.mockResolvedValue({ ...basePromotion, destinationType: 'CATEGORY', categoryId: CATEGORY_ID });
    await createPromotion({ title: 'X', destinationType: 'CATEGORY', categoryId: CATEGORY_ID } as never);
    expect(prismaMock.promotion.create).toHaveBeenCalled();
  });

  it('updatePromotion re-validates the MERGED record when only categoryId changes (destinationType left as CATEGORY from the existing row)', async () => {
    prismaMock.promotion.findUnique.mockResolvedValue({ ...basePromotion, destinationType: 'CATEGORY', categoryId: CATEGORY_ID });
    prismaMock.category.findUnique.mockResolvedValue(null); // the new categoryId doesn't exist
    await expect(updatePromotion(PROMOTION_ID, { categoryId: 'does-not-exist' } as never)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(prismaMock.promotion.update).not.toHaveBeenCalled();
  });

  it('updatePromotion rejects endDate before startDate', async () => {
    prismaMock.promotion.findUnique.mockResolvedValue(basePromotion);
    await expect(
      updatePromotion(PROMOTION_ID, { startDate: new Date('2026-06-10'), endDate: new Date('2026-06-01') } as never),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.promotion.update).not.toHaveBeenCalled();
  });
});

/**
 * Feature: Promotion — public visibility
 * Scenario: only `isActive: true` rows within their (optional) start/end window are ever
 * returned — mirrors `VISIBLE_DEAL_WHERE`'s "hard-coded server-side filter, never trust a
 * caller-supplied override" discipline. This test asserts the WHERE clause shape passed to
 * Prisma, since the mock doesn't itself apply filtering.
 */
describe('Promotion — public visibility (getPublicPromotions)', () => {
  it('queries only isActive:true rows inside the visibility window, never a caller override', async () => {
    prismaMock.promotion.findMany.mockResolvedValue([]);
    await getPublicPromotions();
    const call = prismaMock.promotion.findMany.mock.calls[0][0];
    expect(call.where.isActive).toBe(true);
    expect(call.where.AND).toBeDefined();
  });

  it('maps each row to a public shape with the primary (or first) image storageKey, never leaking internal ids beyond category/deal refs', async () => {
    prismaMock.promotion.findMany.mockResolvedValue([
      {
        ...basePromotion,
        mediaImages: [
          { id: 'img-1', storageKey: 'promotions/x/1.jpg', isPrimary: false, sortOrder: 1 },
          { id: 'img-2', storageKey: 'promotions/x/0.jpg', isPrimary: true, sortOrder: 0 },
        ],
      },
    ]);
    const result = await getPublicPromotions();
    expect(result[0].image).toBe('promotions/x/0.jpg');
  });

  it('returns null image when a promotion has no uploaded images yet', async () => {
    prismaMock.promotion.findMany.mockResolvedValue([{ ...basePromotion, mediaImages: [] }]);
    const result = await getPublicPromotions();
    expect(result[0].image).toBeNull();
  });
});
