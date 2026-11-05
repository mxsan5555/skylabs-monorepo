import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import {
  buildDealSlug,
  createDeal,
  updateDeal,
  setDealStatus,
  copyDeal,
  createPackage,
  updatePackage,
  deletePackage,
  reorderPackages,
  addDealImage,
  discountOf,
} from './deal.service';

/**
 * Feature: deals in the console (docs/msd/PLANNING.md §2.7, TESTING.md §4.2 "Deals").
 * Branch first, prices derived from packages, Draft until ready, slug rules, package cards.
 */

const prismaMock = vi.mocked(prisma, true);

const VENDOR_ID = 'e0e0e0e0-0000-4000-8000-000000000005';
const OTHER_VENDOR_ID = 'e1e1e1e1-0000-4000-8000-000000000015';
const BRANCH_ID = 'f0f0f0f0-0000-4000-8000-000000000006';
const OTHER_BRANCH_ID = 'c2c2c2c2-0000-4000-8000-000000000009';
const DEAL_ID = 'a1a1a1a1-0000-4000-8000-000000000007';
const CATEGORY_ID = 'b1b1b1b1-0000-4000-8000-000000000008';
const THERAPIST_ID = 'd3d3d3d3-0000-4000-8000-00000000000a';
const PACKAGE_ID = 'a2a2a2a2-0000-4000-8000-00000000000b';

const branch = (overrides: Record<string, unknown> = {}) => ({ id: BRANCH_ID, vendorId: VENDOR_ID, city: 'Pune', isActive: true, ...overrides });
const deal = (overrides: Record<string, unknown> = {}) => ({
  id: DEAL_ID,
  vendorId: VENDOR_ID,
  branchId: BRANCH_ID,
  categoryId: CATEGORY_ID,
  subcategoryId: null,
  title: 'Swedish full body massage',
  slug: 'swedish-full-body-massage-zen-spa-pune',
  previousSlugs: [],
  publishedAt: null,
  maxBookings: null,
  shortDescription: null,
  ...overrides,
});
/** The `DEAL_INCLUDE` shape `loadDeal` reads back. */
const loaded = (overrides: Record<string, unknown> = {}) => ({
  ...deal(),
  packages: [],
  faqs: [],
  mediaImages: [],
  mediaVideo: null,
  therapistLinks: [],
  ...overrides,
});
const pkg = (overrides: Record<string, unknown> = {}) => ({
  id: PACKAGE_ID,
  dealId: DEAL_ID,
  durationMinutes: 60,
  persons: 1,
  sellingPrice: 1499,
  originalPrice: 1999,
  isActive: true,
  ...overrides,
});

const createInput = {
  categoryId: CATEGORY_ID,
  title: 'Swedish full body massage',
  packages: [
    { durationMinutes: 60, persons: 1, sellingPrice: 1499, originalPrice: 1999, inclusions: [], isActive: true },
    { durationMinutes: 60, persons: 2, sellingPrice: 2799, inclusions: ['Steam'], isActive: true },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.branch.findUnique.mockResolvedValue(branch() as never);
  prismaMock.category.findUnique.mockResolvedValue({ id: CATEGORY_ID, parentId: null, type: 'SERVICE' } as never);
  prismaMock.member.findUnique.mockResolvedValue({ businessName: 'Zen Spa' } as never);
  prismaMock.deal.findFirst.mockResolvedValue(null); // every slug free
  prismaMock.deal.create.mockResolvedValue({ id: DEAL_ID } as never);
  prismaMock.deal.findUnique.mockResolvedValue(deal() as never);
  prismaMock.deal.findUniqueOrThrow.mockResolvedValue(loaded() as never);
  prismaMock.dealPackage.findFirst.mockResolvedValue(null);
  prismaMock.orderItem.groupBy.mockResolvedValue([] as never);
});

describe('slug rule', () => {
  it('joins title, member and city in kebab case and cuts at a whole word by 90 characters', () => {
    expect(buildDealSlug('Swedish Full Body Massage', 'Zen Spa & Wellness', 'Pune')).toBe('swedish-full-body-massage-zen-spa-wellness-pune');
    const long = buildDealSlug('A very long deal title that keeps going and going for quite a while', 'Some Business Name Pvt Ltd', 'Thiruvananthapuram');
    expect(long.length).toBeLessThanOrEqual(90);
    expect(long.endsWith('-')).toBe(false);
  });

  it('discount is rounded down and null without a higher original', () => {
    expect(discountOf(1499, 1999)).toBe(25);
    expect(discountOf(100, 100)).toBeNull();
    expect(discountOf(100, null)).toBeNull();
  });
});

describe('createDeal', () => {
  it('404s for a branch of another member and creates nothing', async () => {
    prismaMock.branch.findUnique.mockResolvedValue(branch({ vendorId: OTHER_VENDOR_ID }) as never);
    await expect(createDeal(VENDOR_ID, BRANCH_ID, createInput as never)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('rejects a category that is not SERVICE', async () => {
    prismaMock.category.findUnique.mockResolvedValue({ id: CATEGORY_ID, parentId: null, type: 'PRODUCT' } as never);
    await expect(createDeal(VENDOR_ID, BRANCH_ID, createInput as never)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('needs no member or branch category grant (D10)', async () => {
    await createDeal(VENDOR_ID, BRANCH_ID, createInput as never);
    expect(prismaMock.vendorCategoryAccess.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.branchCategoryAccess.findUnique).not.toHaveBeenCalled();
  });

  it('starts as Draft with no approval step, member and branch from the server, slug generated', async () => {
    await createDeal(VENDOR_ID, BRANCH_ID, createInput as never);
    const data = prismaMock.deal.create.mock.calls[0][0]!.data as Record<string, unknown>;
    expect(data).toMatchObject({
      vendorId: VENDOR_ID,
      branchId: BRANCH_ID,
      status: 'DRAFT',
      approvalStatus: 'APPROVED',
      slug: 'swedish-full-body-massage-zen-spa-pune',
    });
    expect(prismaMock.notification?.create).not.toHaveBeenCalled();
  });

  it('adds -2 when the generated slug is taken (also by an old slug)', async () => {
    prismaMock.deal.findFirst.mockResolvedValueOnce({ id: 'other' } as never).mockResolvedValue(null);
    await createDeal(VENDOR_ID, BRANCH_ID, createInput as never);
    expect((prismaMock.deal.create.mock.calls[0][0]!.data as { slug: string }).slug).toBe('swedish-full-body-massage-zen-spa-pune-2');
    expect(prismaMock.deal.findFirst.mock.calls[0][0]!.where).toMatchObject({
      OR: [{ slug: 'swedish-full-body-massage-zen-spa-pune' }, { previousSlugs: { has: 'swedish-full-body-massage-zen-spa-pune' } }],
    });
  });

  it('409s for a slug the client picked that is already used', async () => {
    prismaMock.deal.findFirst.mockResolvedValue({ id: 'other' } as never);
    await expect(createDeal(VENDOR_ID, BRANCH_ID, { ...createInput, slug: 'taken' } as never)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('writes every package card in order, FAQs, and syncs the from price from the cheapest package', async () => {
    prismaMock.dealPackage.findFirst.mockResolvedValue(pkg() as never);
    await createDeal(VENDOR_ID, BRANCH_ID, { ...createInput, faqs: [{ question: 'Q?', answer: 'A.' }] } as never);
    const rows = prismaMock.dealPackage.createMany.mock.calls[0][0]!.data as Array<Record<string, unknown>>;
    expect(rows.map((r) => [r.persons, r.sortOrder])).toEqual([[1, 0], [2, 1]]);
    expect(prismaMock.dealFaq.createMany).toHaveBeenCalledWith({ data: [{ dealId: DEAL_ID, question: 'Q?', answer: 'A.', sortOrder: 0 }] });
    expect(prismaMock.deal.update).toHaveBeenCalledWith({
      where: { id: DEAL_ID },
      data: { salePrice: 1499, originalPrice: 1999, discountPercent: 25, durationMinutes: 60 },
    });
  });

  it('stores the tagline in shortDescription', async () => {
    await createDeal(VENDOR_ID, BRANCH_ID, { ...createInput, tagline: 'Unwind in 60 minutes' } as never);
    expect(prismaMock.deal.create.mock.calls[0][0]!.data).toMatchObject({ shortDescription: 'Unwind in 60 minutes' });
  });

  it('rejects a therapist from another branch and creates nothing', async () => {
    prismaMock.therapist.findMany.mockResolvedValue([{ id: THERAPIST_ID, vendorId: VENDOR_ID, branchId: OTHER_BRANCH_ID }] as never);
    await expect(createDeal(VENDOR_ID, BRANCH_ID, { ...createInput, therapistIds: [THERAPIST_ID] } as never)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(prismaMock.deal.create).not.toHaveBeenCalled();
  });

  it('links therapists of the same branch', async () => {
    prismaMock.therapist.findMany.mockResolvedValue([{ id: THERAPIST_ID, vendorId: VENDOR_ID, branchId: BRANCH_ID }] as never);
    await createDeal(VENDOR_ID, BRANCH_ID, { ...createInput, therapistIds: [THERAPIST_ID] } as never);
    expect(prismaMock.dealTherapist.createMany).toHaveBeenCalledWith({ data: [{ dealId: DEAL_ID, therapistId: THERAPIST_ID }] });
  });
});

describe('updateDeal', () => {
  it('404s for a deal of another member', async () => {
    prismaMock.deal.findUnique.mockResolvedValue(deal({ vendorId: OTHER_VENDOR_ID }) as never);
    await expect(updateDeal(VENDOR_ID, BRANCH_ID, DEAL_ID, { title: 'Renamed deal' }, { actorIsStaff: false })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('therapistIds [] clears the links; omitting it leaves them', async () => {
    await updateDeal(VENDOR_ID, BRANCH_ID, DEAL_ID, { therapistIds: [] }, { actorIsStaff: false });
    expect(prismaMock.dealTherapist.deleteMany).toHaveBeenCalledWith({ where: { dealId: DEAL_ID } });
    expect(prismaMock.dealTherapist.createMany).not.toHaveBeenCalled();
    vi.clearAllMocks();
    prismaMock.deal.findUnique.mockResolvedValue(deal() as never);
    prismaMock.deal.findUniqueOrThrow.mockResolvedValue(loaded() as never);
    prismaMock.orderItem.groupBy.mockResolvedValue([] as never);
    await updateDeal(VENDOR_ID, BRANCH_ID, DEAL_ID, { title: 'Renamed deal' }, { actorIsStaff: false });
    expect(prismaMock.dealTherapist.deleteMany).not.toHaveBeenCalled();
  });

  it('replaces FAQs as a set in the given order', async () => {
    await updateDeal(VENDOR_ID, BRANCH_ID, DEAL_ID, { faqs: [{ question: 'B?', answer: 'b' }, { question: 'A?', answer: 'a' }] }, { actorIsStaff: false });
    expect(prismaMock.dealFaq.deleteMany).toHaveBeenCalledWith({ where: { dealId: DEAL_ID } });
    expect(prismaMock.dealFaq.createMany).toHaveBeenCalledWith({
      data: [
        { dealId: DEAL_ID, question: 'B?', answer: 'b', sortOrder: 0 },
        { dealId: DEAL_ID, question: 'A?', answer: 'a', sortOrder: 1 },
      ],
    });
  });

  it('a member may change the slug while the deal was never live', async () => {
    await updateDeal(VENDOR_ID, BRANCH_ID, DEAL_ID, { slug: 'new-slug' }, { actorIsStaff: false });
    expect(prismaMock.deal.update.mock.calls[0][0]!.data).toMatchObject({ slug: 'new-slug', previousSlugs: [] });
  });

  it('a member cannot change the slug once the deal was live (422); staff can, and the old slug is kept', async () => {
    prismaMock.deal.findUnique.mockResolvedValue(deal({ publishedAt: new Date() }) as never);
    await expect(updateDeal(VENDOR_ID, BRANCH_ID, DEAL_ID, { slug: 'new-slug' }, { actorIsStaff: false })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await updateDeal(VENDOR_ID, BRANCH_ID, DEAL_ID, { slug: 'new-slug' }, { actorIsStaff: true });
    expect(prismaMock.deal.update.mock.calls[0][0]!.data).toMatchObject({
      slug: 'new-slug',
      previousSlugs: ['swedish-full-body-massage-zen-spa-pune'],
    });
  });

  it('null clears an optional field', async () => {
    await updateDeal(VENDOR_ID, BRANCH_ID, DEAL_ID, { endDate: null, limitPerCustomer: null }, { actorIsStaff: false });
    expect(prismaMock.deal.update.mock.calls[0][0]!.data).toMatchObject({ endDate: null, limitPerCustomer: null });
  });
});

describe('setDealStatus', () => {
  const readiness = (images: number, packages: number, branchActive = true, member = 'ACTIVE') =>
    ({ branch: { isActive: branchActive }, vendor: { status: member }, _count: { mediaImages: images, packages } }) as never;

  it('Active without an image or an active package is 422 DEAL_NOT_READY listing both', async () => {
    prismaMock.deal.findUniqueOrThrow.mockResolvedValueOnce(readiness(0, 0));
    await expect(setDealStatus(VENDOR_ID, BRANCH_ID, DEAL_ID, 'ACTIVE')).rejects.toMatchObject({
      code: 'DEAL_NOT_READY',
      details: { missing: ['image', 'package'] },
    });
    expect(prismaMock.deal.update).not.toHaveBeenCalled();
  });

  it('a ready Draft goes Active with no approval and gets publishedAt the first time', async () => {
    prismaMock.deal.findUniqueOrThrow.mockResolvedValueOnce(readiness(1, 1)).mockResolvedValue(loaded() as never);
    await setDealStatus(VENDOR_ID, BRANCH_ID, DEAL_ID, 'ACTIVE');
    const data = prismaMock.deal.update.mock.calls[0][0]!.data as Record<string, unknown>;
    expect(data.status).toBe('ACTIVE');
    expect(data.publishedAt).toBeInstanceOf(Date);
  });

  it('Inactive needs no readiness check', async () => {
    await setDealStatus(VENDOR_ID, BRANCH_ID, DEAL_ID, 'INACTIVE');
    expect(prismaMock.deal.update.mock.calls[0][0]!.data).toEqual({ status: 'INACTIVE' });
  });
});

describe('copyDeal', () => {
  it('copies to another own branch as Draft with packages and FAQs, no media, therapists or stock', async () => {
    prismaMock.branch.findUnique.mockResolvedValue(branch({ id: OTHER_BRANCH_ID, city: 'Mumbai' }) as never);
    prismaMock.deal.findUniqueOrThrow
      .mockResolvedValueOnce({ ...deal({ maxBookings: 50 }), packages: [pkg()], faqs: [{ question: 'Q?', answer: 'A.' }] } as never)
      .mockResolvedValue(loaded() as never);
    prismaMock.deal.findUnique.mockResolvedValue(deal({ branchId: OTHER_BRANCH_ID }) as never);
    await copyDeal(VENDOR_ID, OTHER_BRANCH_ID, DEAL_ID, OTHER_BRANCH_ID);
    const data = prismaMock.deal.create.mock.calls[0][0]!.data as Record<string, unknown>;
    expect(data).toMatchObject({ branchId: OTHER_BRANCH_ID, status: 'DRAFT', slug: 'swedish-full-body-massage-zen-spa-mumbai' });
    expect(data).not.toHaveProperty('maxBookings');
    expect(prismaMock.dealPackage.createMany).toHaveBeenCalled();
    expect(prismaMock.dealFaq.createMany).toHaveBeenCalled();
    expect(prismaMock.dealTherapist.createMany).not.toHaveBeenCalled();
    expect(prismaMock.dealImage.create).not.toHaveBeenCalled();
  });

  it('404s for a target branch of another member', async () => {
    prismaMock.branch.findUnique.mockResolvedValue(branch({ id: OTHER_BRANCH_ID, vendorId: OTHER_VENDOR_ID }) as never);
    await expect(copyDeal(VENDOR_ID, BRANCH_ID, DEAL_ID, OTHER_BRANCH_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('package cards', () => {
  it('adds a package at the end and re-syncs prices', async () => {
    prismaMock.dealPackage.count.mockResolvedValue(2);
    await createPackage(VENDOR_ID, BRANCH_ID, DEAL_ID, { durationMinutes: 90, persons: 1, sellingPrice: 1999, inclusions: [], isActive: true });
    expect(prismaMock.dealPackage.create.mock.calls[0][0]!.data).toMatchObject({ dealId: DEAL_ID, sortOrder: 2, durationMinutes: 90 });
  });

  it('refuses an 11th package', async () => {
    prismaMock.dealPackage.count.mockResolvedValue(10);
    await expect(
      createPackage(VENDOR_ID, BRANCH_ID, DEAL_ID, { durationMinutes: 90, persons: 1, sellingPrice: 1999, inclusions: [], isActive: true }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('deactivating or deleting the last active package is 409 LAST_PACKAGE', async () => {
    prismaMock.dealPackage.findUnique.mockResolvedValue(pkg() as never);
    prismaMock.dealPackage.count.mockResolvedValue(0); // no other active package
    await expect(updatePackage(VENDOR_ID, BRANCH_ID, DEAL_ID, PACKAGE_ID, { isActive: false })).rejects.toMatchObject({ code: 'LAST_PACKAGE' });
    await expect(deletePackage(VENDOR_ID, BRANCH_ID, DEAL_ID, PACKAGE_ID)).rejects.toMatchObject({ code: 'LAST_PACKAGE' });
  });

  it('a package in a cart or an order is never deleted (409)', async () => {
    prismaMock.dealPackage.findUnique.mockResolvedValue(pkg() as never);
    prismaMock.dealPackage.count.mockResolvedValue(1);
    prismaMock.cartItem.count.mockResolvedValue(1);
    prismaMock.orderItem.count.mockResolvedValue(0);
    await expect(deletePackage(VENDOR_ID, BRANCH_ID, DEAL_ID, PACKAGE_ID)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prismaMock.dealPackage.delete).not.toHaveBeenCalled();
  });

  it('deletes an unused package and re-syncs prices', async () => {
    prismaMock.dealPackage.findUnique.mockResolvedValue(pkg() as never);
    prismaMock.dealPackage.count.mockResolvedValue(1);
    prismaMock.cartItem.count.mockResolvedValue(0);
    prismaMock.orderItem.count.mockResolvedValue(0);
    prismaMock.dealPackage.findFirst.mockResolvedValue(pkg({ id: 'other', sellingPrice: 999, originalPrice: null }) as never);
    await deletePackage(VENDOR_ID, BRANCH_ID, DEAL_ID, PACKAGE_ID);
    expect(prismaMock.dealPackage.delete).toHaveBeenCalledWith({ where: { id: PACKAGE_ID } });
    expect(prismaMock.deal.update).toHaveBeenCalledWith({
      where: { id: DEAL_ID },
      data: { salePrice: 999, originalPrice: 999, discountPercent: null, durationMinutes: 60 },
    });
  });

  it('an original price below the price is refused on edit', async () => {
    prismaMock.dealPackage.findUnique.mockResolvedValue(pkg() as never);
    await expect(updatePackage(VENDOR_ID, BRANCH_ID, DEAL_ID, PACKAGE_ID, { originalPrice: 1000 })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('a package of another deal is 404', async () => {
    prismaMock.dealPackage.findUnique.mockResolvedValue(pkg({ dealId: 'other-deal' }) as never);
    await expect(updatePackage(VENDOR_ID, BRANCH_ID, DEAL_ID, PACKAGE_ID, { name: 'x' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('reorder needs every package exactly once', async () => {
    prismaMock.dealPackage.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }] as never);
    await expect(reorderPackages(VENDOR_ID, BRANCH_ID, DEAL_ID, ['p1'])).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await reorderPackages(VENDOR_ID, BRANCH_ID, DEAL_ID, ['p2', 'p1']);
    expect(prismaMock.dealPackage.update.mock.calls.map((c) => c[0])).toEqual([
      { where: { id: 'p2' }, data: { sortOrder: 0 } },
      { where: { id: 'p1' }, data: { sortOrder: 1 } },
    ]);
  });
});

describe('images', () => {
  it('refuses an 11th image', async () => {
    prismaMock.dealImage.count.mockResolvedValue(10);
    await expect(addDealImage(VENDOR_ID, BRANCH_ID, DEAL_ID, { buffer: Buffer.from(''), originalname: 'a.jpg' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});
