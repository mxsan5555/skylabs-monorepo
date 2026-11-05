import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import {
  addPromotionImage,
  createPromotion,
  updatePromotion,
  getPublicBanners,
  getPublicPromotions,
} from './promotion.service';
import { VISIBLE_DEAL_WHERE, VISIBLE_PRODUCT_WHERE } from './catalog-visibility';

const prismaMock = vi.mocked(prisma, true);

const PROMOTION_ID = 'promo-1';
const CATEGORY_ID = 'cat-1';
const DEAL_ID = 'deal-1';
const PRODUCT_ID = 'prod-1';

const basePromotion = {
  id: PROMOTION_ID,
  title: 'Welcome Offer',
  description: null,
  buttonLabel: 'Explore',
  destinationType: 'ROUTE' as const,
  destinationRoute: '/explore',
  categoryId: null,
  dealId: null,
  productId: null,
  state: null,
  backgroundRole: 'PRIMARY' as const,
  buttonRole: 'PRIMARY' as const,
  sortOrder: 0,
  isActive: true,
  startDate: null,
  endDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  category: null,
  deal: null,
  product: null,
  mediaImages: [],
  placements: [{ slot: 'HOME_AFTER_DEALS' as const }],
};

const baseInput = {
  title: 'X',
  buttonLabel: 'Go',
  backgroundRole: 'SECONDARY' as const,
  buttonRole: 'PRIMARY' as const,
  placements: ['HOME_AFTER_DEALS' as const],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CTA banner — destination validation', () => {
  it('rejects destinationType=CATEGORY with no categoryId', async () => {
    await expect(createPromotion({ ...baseInput, destinationType: 'CATEGORY' } as never)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.promotion.create).not.toHaveBeenCalled();
  });

  it('rejects a categoryId that does not exist', async () => {
    prismaMock.category.findUnique.mockResolvedValue(null);
    await expect(
      createPromotion({ ...baseInput, destinationType: 'CATEGORY', categoryId: CATEGORY_ID } as never),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.promotion.create).not.toHaveBeenCalled();
  });

  it('rejects a deal outside the banner state (PLANNING §6)', async () => {
    prismaMock.deal.findFirst.mockResolvedValue(null);
    await expect(
      createPromotion({ ...baseInput, state: 'Delhi', destinationType: 'DEAL', dealId: DEAL_ID } as never),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.deal.findFirst.mock.calls[0][0]!.where).toMatchObject({ id: DEAL_ID, branch: { is: { state: 'Delhi' } } });
    expect(prismaMock.promotion.create).not.toHaveBeenCalled();
  });

  it('saves a product banner with its state, colour roles and slots', async () => {
    prismaMock.product.findFirst.mockResolvedValue({ id: PRODUCT_ID } as never);
    prismaMock.promotion.create.mockResolvedValue({ ...basePromotion, id: 'new' } as never);
    prismaMock.promotion.findUnique.mockResolvedValue({ ...basePromotion, id: 'new' } as never);
    await createPromotion({
      ...baseInput,
      state: 'Uttar Pradesh',
      destinationType: 'PRODUCT',
      productId: PRODUCT_ID,
      placements: ['HOME_AFTER_PRODUCTS', 'PRODUCT_BOTTOM'],
    } as never);
    const data = prismaMock.promotion.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toMatchObject({ state: 'Uttar Pradesh', backgroundRole: 'SECONDARY', buttonRole: 'PRIMARY', productId: PRODUCT_ID });
    expect(data.placements).toEqual({ create: [{ slot: 'HOME_AFTER_PRODUCTS' }, { slot: 'PRODUCT_BOTTOM' }] });
  });

  it('re-validates the merged record when only categoryId changes', async () => {
    prismaMock.promotion.findUnique.mockResolvedValue({ ...basePromotion, destinationType: 'CATEGORY', categoryId: CATEGORY_ID } as never);
    prismaMock.category.findUnique.mockResolvedValue(null);
    await expect(updatePromotion(PROMOTION_ID, { categoryId: 'does-not-exist' } as never)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.promotion.update).not.toHaveBeenCalled();
  });

  it('re-checks the existing deal when only the state changes', async () => {
    prismaMock.promotion.findUnique.mockResolvedValue({ ...basePromotion, destinationType: 'DEAL', dealId: DEAL_ID } as never);
    prismaMock.deal.findFirst.mockResolvedValue(null);
    await expect(updatePromotion(PROMOTION_ID, { state: 'Delhi' } as never)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.promotion.update).not.toHaveBeenCalled();
  });

  it('replaces the slots when placements are sent', async () => {
    prismaMock.promotion.findUnique.mockResolvedValue(basePromotion as never);
    prismaMock.promotion.update.mockResolvedValue(basePromotion as never);
    await updatePromotion(PROMOTION_ID, { placements: ['CATEGORY_TOP'] } as never);
    const data = prismaMock.promotion.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.placements).toEqual({ deleteMany: {}, create: [{ slot: 'CATEGORY_TOP' }] });
  });

  it('rejects endDate before startDate', async () => {
    prismaMock.promotion.findUnique.mockResolvedValue(basePromotion as never);
    await expect(
      updatePromotion(PROMOTION_ID, { startDate: new Date('2026-06-10'), endDate: new Date('2026-06-01') } as never),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.promotion.update).not.toHaveBeenCalled();
  });
});

describe('CTA banner — one image', () => {
  it('refuses a second image with 422', async () => {
    prismaMock.promotion.findUnique.mockResolvedValue(basePromotion as never);
    prismaMock.promotionImage.count.mockResolvedValue(1);
    await expect(addPromotionImage(PROMOTION_ID, { buffer: Buffer.alloc(1), originalname: 'a.jpg' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});

describe('CTA banner — public read by slot and state (getPublicBanners)', () => {
  it('only active, in-date banners of the slot whose deal or product the storefront shows', async () => {
    prismaMock.promotion.findMany.mockResolvedValue([]);
    await getPublicBanners({ slot: 'HOME_AFTER_DEALS', state: null });
    const where = prismaMock.promotion.findMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    expect(where.state).toBeNull();
    expect(where.placements).toEqual({ some: { slot: 'HOME_AFTER_DEALS' } });
    expect(where.OR).toEqual([
      { destinationType: { in: ['ROUTE', 'CATEGORY'] } },
      { destinationType: 'DEAL', deal: { is: VISIBLE_DEAL_WHERE } },
      { destinationType: 'PRODUCT', product: { is: VISIBLE_PRODUCT_WHERE } },
    ]);
    expect(where.AND).toBeDefined();
  });

  it("serves the visitor's state first, then falls back to Global", async () => {
    prismaMock.promotion.findMany
      .mockResolvedValueOnce([]) // Delhi has none for this slot
      .mockResolvedValueOnce([basePromotion] as never); // Global
    const result = await getPublicBanners({ slot: 'DEAL_BOTTOM', state: 'Delhi' });
    expect(prismaMock.promotion.findMany.mock.calls[0][0].where.state).toBe('Delhi');
    expect(prismaMock.promotion.findMany.mock.calls[1][0].where.state).toBeNull();
    expect(result.map((b) => b.id)).toEqual([PROMOTION_ID]);
  });

  it('maps each banner to the public shape with roles, link and primary image', async () => {
    prismaMock.promotion.findMany.mockResolvedValue([
      {
        ...basePromotion,
        backgroundRole: 'TERTIARY',
        destinationType: 'PRODUCT',
        destinationRoute: null,
        productId: PRODUCT_ID,
        product: { id: PRODUCT_ID },
        mediaImages: [
          { id: 'img-1', storageKey: 'cta-banners/x/1.jpg', isPrimary: false, sortOrder: 1 },
          { id: 'img-2', storageKey: 'cta-banners/x/0.jpg', isPrimary: true, sortOrder: 0 },
        ],
      },
    ] as never);
    const [banner] = await getPublicBanners({ slot: 'HOME_AFTER_DEALS', state: null });
    expect(banner).toEqual({
      id: PROMOTION_ID,
      title: 'Welcome Offer',
      description: null,
      buttonLabel: 'Explore',
      backgroundRole: 'TERTIARY',
      buttonRole: 'PRIMARY',
      href: `/products/${PRODUCT_ID}`,
      image: 'cta-banners/x/0.jpg',
    });
  });

  it('links categories and deals to their storefront pages', async () => {
    prismaMock.promotion.findMany.mockResolvedValue([
      { ...basePromotion, id: 'c', destinationType: 'CATEGORY', category: { slug: 'massage' } },
      { ...basePromotion, id: 'd', destinationType: 'DEAL', dealId: DEAL_ID, deal: { id: DEAL_ID } },
    ] as never);
    const banners = await getPublicBanners({ slot: 'HOME_AFTER_DEALS', state: null });
    expect(banners.map((b) => b.href)).toEqual(['/category/massage', `/deal/${DEAL_ID}`]);
  });

  /** Regression: a DEAL-destination promotion used to keep linking to its Deal with only
   *  `{id, title, slug}` selected — no visibility check at all — so a banner could point at a
   *  Deal whose vendor had since been suspended (or the deal itself deactivated/unapproved,
   *  or its branch deactivated). Mirrors `VISIBLE_DEAL_WHERE`'s bar exactly. */
  const dealDestination = (deal: Record<string, unknown>) => ({
    ...basePromotion,
    destinationType: 'DEAL' as const,
    dealId: 'deal-1',
    deal: { id: 'deal-1', title: 'Deep Tissue Massage', slug: 'deep-tissue-massage', status: 'ACTIVE', approvalStatus: 'APPROVED', vendor: { status: 'ACTIVE' }, branch: { isActive: true }, ...deal },
    mediaImages: [],
  });

  it('keeps the linked deal when it is fully visible (active, approved, active vendor, active branch)', async () => {
    prismaMock.promotion.findMany.mockResolvedValue([dealDestination({})]);
    const result = await getPublicPromotions();
    expect(result[0].deal).toEqual({ id: 'deal-1', title: 'Deep Tissue Massage', slug: 'deep-tissue-massage' });
  });

  it('hides the linked deal (returns deal: null) when its vendor has been suspended', async () => {
    prismaMock.promotion.findMany.mockResolvedValue([dealDestination({ vendor: { status: 'SUSPENDED' } })]);
    const result = await getPublicPromotions();
    expect(result[0].deal).toBeNull();
  });

  it('hides the linked deal when the deal itself is no longer ACTIVE', async () => {
    prismaMock.promotion.findMany.mockResolvedValue([dealDestination({ status: 'INACTIVE' })]);
    const result = await getPublicPromotions();
    expect(result[0].deal).toBeNull();
  });

  it('hides the linked deal when its branch has been deactivated', async () => {
    prismaMock.promotion.findMany.mockResolvedValue([dealDestination({ branch: { isActive: false } })]);
    const result = await getPublicPromotions();
    expect(result[0].deal).toBeNull();
  });
});
