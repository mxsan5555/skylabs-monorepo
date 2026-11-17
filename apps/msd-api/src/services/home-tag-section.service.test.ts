import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import {
  ineligibleReason,
  countEligibleItems,
  getSectionsForState,
  setSectionEnabled,
  addItem,
  removeItem,
  reorderItems,
  listOverview,
  getPublicHomeTagSections,
  MIN_ELIGIBLE_ITEMS_PER_TAG_SECTION,
  ADMIN_TAG_ORDER,
  STOREFRONT_TAG_ORDER,
} from './home-tag-section.service';

const prismaMock = vi.mocked(prisma, true);

const okDeal = {
  status: 'ACTIVE',
  approvalStatus: 'APPROVED',
  endDate: null as Date | null,
  vendor: { status: 'ACTIVE' },
  branch: { isActive: true },
};

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Feature: Home Tag Sections — eligibility
 * Scenario: the general bar mirrors Home Hero's deal checks exactly; Expire soon additionally
 * requires a future `endDate` — a deal with none at all is ineligible there (2026-10-28 decision,
 * no arbitrary day-window).
 */
describe('ineligibleReason', () => {
  it('reuses the Home Hero deal checks for every tag', () => {
    expect(ineligibleReason('NEW', { ...okDeal, vendor: { status: 'SUSPENDED' } })).toBe('Member is suspended');
    expect(ineligibleReason('NEW', { ...okDeal, branch: { isActive: false } })).toBe('Branch paused');
    expect(ineligibleReason('NEW', { ...okDeal, status: 'DRAFT' })).toBe('Deal is draft');
    expect(ineligibleReason('NEW', { ...okDeal, approvalStatus: 'PENDING' })).toBe('Deal is pending');
    expect(ineligibleReason('NEW', okDeal)).toBeNull();
  });

  it('DEAL and HOT_DEAL ignore endDate entirely', () => {
    expect(ineligibleReason('DEAL', { ...okDeal, endDate: null })).toBeNull();
    expect(ineligibleReason('HOT_DEAL', { ...okDeal, endDate: new Date('2000-01-01') })).toBeNull();
  });

  it('EXPIRE_SOON requires a future endDate — no end date at all is ineligible, not just unflagged', () => {
    expect(ineligibleReason('EXPIRE_SOON', { ...okDeal, endDate: null })).toBe('No end date set');
    expect(ineligibleReason('EXPIRE_SOON', { ...okDeal, endDate: new Date(Date.now() - 86_400_000) })).toBe('Already past its end date');
    expect(ineligibleReason('EXPIRE_SOON', { ...okDeal, endDate: new Date(Date.now() + 86_400_000) })).toBeNull();
  });

  it('checks general eligibility before the Expire soon date rule', () => {
    expect(ineligibleReason('EXPIRE_SOON', { ...okDeal, status: 'PAUSED', endDate: null })).toBe('Deal is paused');
  });
});

describe('setSectionEnabled', () => {
  it('creates a new row when the (state, tag) section does not exist', async () => {
    prismaMock.homeTagSection.findFirst.mockResolvedValue(null);
    prismaMock.homeTagSection.create.mockResolvedValue({ id: 's1', state: 'Delhi', tag: 'NEW', isEnabled: true } as never);
    await setSectionEnabled('Delhi', 'NEW', true);
    expect(prismaMock.homeTagSection.findFirst).toHaveBeenCalledWith({ where: { state: 'Delhi', tag: 'NEW' } });
    expect(prismaMock.homeTagSection.create).toHaveBeenCalledWith({ data: { state: 'Delhi', tag: 'NEW', isEnabled: true } });
    expect(prismaMock.homeTagSection.update).not.toHaveBeenCalled();
  });

  it('updates the existing Global/Default (state: null) row when it already exists', async () => {
    prismaMock.homeTagSection.findFirst.mockResolvedValue({ id: 'g1', state: null, tag: 'DEAL', isEnabled: true } as never);
    prismaMock.homeTagSection.update.mockResolvedValue({ id: 'g1', state: null, tag: 'DEAL', isEnabled: false } as never);
    await setSectionEnabled(null, 'DEAL', false);
    expect(prismaMock.homeTagSection.findFirst).toHaveBeenCalledWith({ where: { state: null, tag: 'DEAL' } });
    expect(prismaMock.homeTagSection.update).toHaveBeenCalledWith({ where: { id: 'g1' }, data: { isEnabled: false } });
    expect(prismaMock.homeTagSection.create).not.toHaveBeenCalled();
  });
});

describe('getSectionsForState', () => {
  it('always returns all 4 tags in ADMIN_TAG_ORDER, synthesizing defaults for ones never configured', async () => {
    expect(ADMIN_TAG_ORDER).toEqual(['NEW', 'DEAL', 'HOT_DEAL', 'EXPIRE_SOON']);
    prismaMock.homeTagSection.findMany.mockResolvedValue([] as never);
    const rows = await getSectionsForState('Delhi');
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.tag)).toEqual(['NEW', 'DEAL', 'HOT_DEAL', 'EXPIRE_SOON']);
    for (const row of rows) {
      expect(row).toMatchObject({ id: null, isEnabled: false, itemCount: 0, eligibleCount: 0, status: 'DISABLED' });
    }
  });

  it('a configured, enabled row with >=1 eligible item is LIVE; with 0 it is DRAFT', async () => {
    prismaMock.homeTagSection.findMany.mockResolvedValue([
      { id: 'sec-new', state: 'Delhi', tag: 'NEW', isEnabled: true, updatedAt: new Date(), _count: { items: 2 } },
      { id: 'sec-deal', state: 'Delhi', tag: 'DEAL', isEnabled: true, updatedAt: new Date(), _count: { items: 1 } },
    ] as never);
    prismaMock.homeTagSection.findUnique.mockImplementation(((args: { where: { id: string } }) =>
      Promise.resolve(args.where.id === 'sec-new' ? { id: 'sec-new', tag: 'NEW' } : { id: 'sec-deal', tag: 'DEAL' })) as never);
    prismaMock.homeTagSectionItem.findMany.mockImplementation(((args: { where: { homeTagSectionId: string } }) =>
      Promise.resolve(args.where.homeTagSectionId === 'sec-new' ? [{ id: 'i1' }] : [])) as never);
    const rows = await getSectionsForState('Delhi');
    expect(rows.find((r) => r.tag === 'NEW')).toMatchObject({ status: 'LIVE', eligibleCount: 1, itemCount: 2 });
    expect(rows.find((r) => r.tag === 'DEAL')).toMatchObject({ status: 'DRAFT', eligibleCount: 0, itemCount: 1 });
  });

  it('a configured but disabled row is DISABLED regardless of eligible items', async () => {
    prismaMock.homeTagSection.findMany.mockResolvedValue([
      { id: 'sec-hot', state: null, tag: 'HOT_DEAL', isEnabled: false, updatedAt: new Date(), _count: { items: 3 } },
    ] as never);
    prismaMock.homeTagSection.findUnique.mockResolvedValue({ id: 'sec-hot', tag: 'HOT_DEAL' } as never);
    prismaMock.homeTagSectionItem.findMany.mockResolvedValue([{ id: 'i1' }, { id: 'i2' }] as never);
    const rows = await getSectionsForState(null);
    expect(rows.find((r) => r.tag === 'HOT_DEAL')).toMatchObject({ status: 'DISABLED', isEnabled: false });
  });
});

describe('addItem / removeItem / reorderItems', () => {
  it('addItem checks state membership, rejects a duplicate, and appends at the end', async () => {
    prismaMock.homeTagSection.findUnique.mockResolvedValue({ id: 'sec-1', state: 'Delhi', tag: 'NEW' } as never);
    prismaMock.deal.findFirst.mockResolvedValue({ id: 'deal-1' } as never);
    prismaMock.homeTagSectionItem.findFirst.mockResolvedValue(null);
    prismaMock.homeTagSectionItem.count.mockResolvedValue(2);
    prismaMock.homeTagSectionItem.create.mockResolvedValue({ id: 'item-1', deal: { ...okDeal, salePrice: '999.00', mediaImages: [] } } as never);
    await addItem('sec-1', 'deal-1');
    expect(prismaMock.homeTagSectionItem.create.mock.calls[0][0].data).toMatchObject({
      homeTagSectionId: 'sec-1',
      dealId: 'deal-1',
      sortOrder: 2,
    });
  });

  it('addItem refuses a deal already in the section with 409', async () => {
    prismaMock.homeTagSection.findUnique.mockResolvedValue({ id: 'sec-1', state: null, tag: 'NEW' } as never);
    prismaMock.deal.findFirst.mockResolvedValue({ id: 'deal-1' } as never);
    prismaMock.homeTagSectionItem.findFirst.mockResolvedValue({ id: 'existing' } as never);
    await expect(addItem('sec-1', 'deal-1')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prismaMock.homeTagSectionItem.create).not.toHaveBeenCalled();
  });

  it('addItem refuses a deal from another state with 422', async () => {
    prismaMock.homeTagSection.findUnique.mockResolvedValue({ id: 'sec-1', state: 'Delhi', tag: 'NEW' } as never);
    prismaMock.deal.findFirst.mockResolvedValue(null);
    prismaMock.deal.findUnique.mockResolvedValue({ id: 'deal-1' } as never);
    await expect(addItem('sec-1', 'deal-1')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('removeItem 404s for an item that does not exist', async () => {
    prismaMock.homeTagSectionItem.findUnique.mockResolvedValue(null);
    await expect(removeItem('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('reorderItems saves the new order in one transaction and refuses a mismatched set', async () => {
    prismaMock.homeTagSectionItem.findMany.mockResolvedValue([{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }] as never);
    prismaMock.homeTagSectionItem.update.mockImplementation(((args: unknown) => args) as never);
    prismaMock.$transaction.mockResolvedValue([] as never);
    await reorderItems('sec-1', ['i3', 'i1', 'i2']);
    expect(prismaMock.homeTagSectionItem.update.mock.calls.map((c) => c[0])).toEqual([
      { where: { id: 'i3' }, data: { sortOrder: 0 } },
      { where: { id: 'i1' }, data: { sortOrder: 1 } },
      { where: { id: 'i2' }, data: { sortOrder: 2 } },
    ]);
    await expect(reorderItems('sec-1', ['i1'])).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('listOverview', () => {
  it('always lists Global, even with zero sections', async () => {
    prismaMock.homeTagSection.findMany.mockResolvedValue([] as never);
    expect(await listOverview()).toEqual([{ state: null, sectionsEnabled: 0, liveSections: 0, updatedAt: null }]);
  });

  it('counts enabled vs. live independently per state', async () => {
    const at = new Date('2026-10-28T10:00:00Z');
    prismaMock.homeTagSection.findMany.mockResolvedValue([
      { id: 'a', state: 'Delhi', tag: 'NEW', isEnabled: true, updatedAt: at, _count: { items: 1 } },
      { id: 'b', state: 'Delhi', tag: 'DEAL', isEnabled: true, updatedAt: at, _count: { items: 0 } },
      { id: 'c', state: 'Delhi', tag: 'HOT_DEAL', isEnabled: false, updatedAt: at, _count: { items: 5 } },
    ] as never);
    prismaMock.homeTagSection.findUnique.mockImplementation(((args: { where: { id: string } }) =>
      Promise.resolve({ id: args.where.id, tag: args.where.id === 'a' ? 'NEW' : 'DEAL' })) as never);
    prismaMock.homeTagSectionItem.findMany.mockImplementation(((args: { where: { homeTagSectionId: string } }) =>
      Promise.resolve(args.where.homeTagSectionId === 'a' ? [{ id: 'i1' }] : [])) as never);
    const rows = await listOverview();
    const delhi = rows.find((r) => r.state === 'Delhi');
    // Enabled: a (NEW) and b (DEAL) = 2. Live (enabled AND >=1 eligible): only a = 1.
    expect(delhi).toMatchObject({ sectionsEnabled: 2, liveSections: 1 });
  });
});

/**
 * Feature: Home Tag Sections — public read, per-tag fallback (PLANNING.md §7.1)
 * Scenario: each of the 4 tags is resolved independently. A state's OWN configured row for a tag
 * never falls back to Global, even disabled or with nothing eligible; only a tag the state never
 * configured at all falls back.
 */
describe('getPublicHomeTagSections — per-tag fallback', () => {
  it('uses the storefront order (New, Hot Deal, Deal, Expire soon), not the admin order', () => {
    expect(STOREFRONT_TAG_ORDER).toEqual(['NEW', 'HOT_DEAL', 'DEAL', 'EXPIRE_SOON']);
  });

  it("serves the state's own enabled, eligible section directly", async () => {
    prismaMock.homeTagSection.findFirst.mockImplementation(((args: { where: { state: string | null; tag: string } }) => {
      const { state, tag } = args.where;
      if (state === 'Delhi' && tag === 'NEW') return Promise.resolve({ id: 'sec-new', state: 'Delhi', tag: 'NEW', isEnabled: true });
      return Promise.resolve(null);
    }) as never);
    prismaMock.homeTagSectionItem.findMany.mockResolvedValue([{ deal: { id: 'd1', title: 'Deal 1' } }] as never);
    const result = await getPublicHomeTagSections('Delhi');
    expect(result).toEqual([{ tag: 'NEW', title: 'New', state: 'Delhi', deals: [{ id: 'd1', title: 'Deal 1' }] }]);
  });

  it("never falls back to Global when the state's own row for that tag is disabled", async () => {
    prismaMock.homeTagSection.findFirst.mockImplementation(((args: { where: { state: string | null; tag: string } }) => {
      const { state, tag } = args.where;
      if (state === 'Delhi' && tag === 'NEW') return Promise.resolve({ id: 'sec-new', state: 'Delhi', tag: 'NEW', isEnabled: false });
      return Promise.resolve(null);
    }) as never);
    const result = await getPublicHomeTagSections('Delhi');
    expect(result).toEqual([]);
    const queriedGlobalForNew = prismaMock.homeTagSection.findFirst.mock.calls.some(
      ([arg]) => (arg as { where: { state: string | null; tag: string } }).where.state === null && (arg as { where: { state: string | null; tag: string } }).where.tag === 'NEW',
    );
    expect(queriedGlobalForNew).toBe(false);
  });

  it("never falls back to Global when the state's own row has nothing eligible (still not Global)", async () => {
    prismaMock.homeTagSection.findFirst.mockImplementation(((args: { where: { state: string | null; tag: string } }) => {
      const { state, tag } = args.where;
      if (state === 'Delhi' && tag === 'DEAL') return Promise.resolve({ id: 'sec-deal', state: 'Delhi', tag: 'DEAL', isEnabled: true });
      return Promise.resolve(null);
    }) as never);
    prismaMock.homeTagSectionItem.findMany.mockResolvedValue([] as never);
    const result = await getPublicHomeTagSections('Delhi');
    expect(result.find((r) => r.tag === 'DEAL')).toBeUndefined();
  });

  it('falls back to Global/Default when the state has no row at all for a tag', async () => {
    prismaMock.homeTagSection.findFirst.mockImplementation(((args: { where: { state: string | null; tag: string } }) => {
      const { state, tag } = args.where;
      if (state === null && tag === 'HOT_DEAL') return Promise.resolve({ id: 'sec-global-hot', state: null, tag: 'HOT_DEAL', isEnabled: true });
      return Promise.resolve(null);
    }) as never);
    prismaMock.homeTagSectionItem.findMany.mockResolvedValue([{ deal: { id: 'd2', title: 'Deal 2' } }] as never);
    const result = await getPublicHomeTagSections('Delhi');
    expect(result).toEqual([{ tag: 'HOT_DEAL', title: 'Hot Deal', state: null, deals: [{ id: 'd2', title: 'Deal 2' }] }]);
  });

  it('with no visitor state at all, checks only Global/Default directly', async () => {
    prismaMock.homeTagSection.findFirst.mockResolvedValue(null);
    await getPublicHomeTagSections();
    for (const [arg] of prismaMock.homeTagSection.findFirst.mock.calls) {
      expect((arg as { where: { state: string | null } }).where.state).toBeNull();
    }
  });

  it('respects MIN_ELIGIBLE_ITEMS_PER_TAG_SECTION = 1 (not Home Hero\'s 5)', () => {
    expect(MIN_ELIGIBLE_ITEMS_PER_TAG_SECTION).toBe(1);
  });
});

describe('countEligibleItems', () => {
  it('EXPIRE_SOON filters on a future endDate at the DB level too', async () => {
    prismaMock.homeTagSection.findUnique.mockResolvedValue({ id: 'sec-1', tag: 'EXPIRE_SOON' } as never);
    prismaMock.homeTagSectionItem.findMany.mockResolvedValue([{ id: 'i1' }] as never);
    await countEligibleItems('sec-1');
    const call = prismaMock.homeTagSectionItem.findMany.mock.calls[0][0];
    expect(call.where.deal.is.endDate).toEqual({ not: null, gt: expect.any(Date) });
  });

  it('NEW/DEAL/HOT_DEAL never add the endDate filter', async () => {
    prismaMock.homeTagSection.findUnique.mockResolvedValue({ id: 'sec-1', tag: 'NEW' } as never);
    prismaMock.homeTagSectionItem.findMany.mockResolvedValue([] as never);
    await countEligibleItems('sec-1');
    const call = prismaMock.homeTagSectionItem.findMany.mock.calls[0][0];
    expect(call.where.deal.is.endDate).toBeUndefined();
  });
});
