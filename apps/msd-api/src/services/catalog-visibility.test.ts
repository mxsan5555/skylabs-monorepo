import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import {
  VISIBLE_DEAL_WHERE,
  VISIBLE_PRODUCT_WHERE,
  VISIBLE_THERAPIST_WHERE,
  listPublicLocations,
  listPublicDeals,
  listPublicProducts,
  listPublicTherapists,
  getPublicDealFacets,
  getPublicVendorBySlugOrThrow,
} from './catalog.service';

const prismaMock = vi.mocked(prisma, true);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('storefront visibility requires an ACTIVE member', () => {
  it.each([
    ['deals', VISIBLE_DEAL_WHERE],
    ['products', VISIBLE_PRODUCT_WHERE],
    ['therapists', VISIBLE_THERAPIST_WHERE],
  ])('%s', (_name, where) => {
    expect(where.vendor).toEqual({ status: 'ACTIVE' });
  });

  it('the city list only counts branches of ACTIVE members', async () => {
    prismaMock.branch.groupBy.mockResolvedValue([] as never);
    await listPublicLocations();
    const arg = prismaMock.branch.groupBy.mock.calls[0][0] as { where: { vendor?: unknown } };
    expect(arg.where.vendor).toEqual({ status: 'ACTIVE' });
  });

  it('the city list has no null filter on state or city (required columns since S22; Prisma rejects `not: null` on them)', async () => {
    prismaMock.branch.groupBy.mockResolvedValue([] as never);
    await listPublicLocations();
    const arg = prismaMock.branch.groupBy.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(arg.where).toEqual({ isActive: true, vendor: { status: 'ACTIVE' } });
  });

  it('deal list, deal facets, product list and therapist list query with the ACTIVE member filter', async () => {
    prismaMock.deal.findMany.mockResolvedValue([] as never);
    prismaMock.deal.count.mockResolvedValue(0 as never);
    prismaMock.product.findMany.mockResolvedValue([] as never);
    prismaMock.product.count.mockResolvedValue(0 as never);
    prismaMock.therapist.findMany.mockResolvedValue([] as never);
    prismaMock.therapist.count.mockResolvedValue(0 as never);

    await listPublicDeals({ page: 1, limit: 10 } as never).catch(() => undefined);
    await getPublicDealFacets({} as never).catch(() => undefined);
    await listPublicProducts({ page: 1, limit: 10 } as never).catch(() => undefined);
    await listPublicTherapists({ page: 1, limit: 10 } as never).catch(() => undefined);

    const wheres = [
      ...prismaMock.deal.findMany.mock.calls,
      ...prismaMock.product.findMany.mock.calls,
      ...prismaMock.therapist.findMany.mock.calls,
    ].map((c) => (c[0] as { where: { vendor?: unknown } }).where);
    expect(wheres.length).toBeGreaterThanOrEqual(4);
    for (const w of wheres) expect(w.vendor).toEqual({ status: 'ACTIVE' });
  });

  it('the public member profile only resolves ACTIVE members', async () => {
    prismaMock.member.findFirst.mockResolvedValue(null as never);
    await expect(getPublicVendorBySlugOrThrow('x')).rejects.toThrow();
    const arg = prismaMock.member.findFirst.mock.calls[0][0] as { where: { status: string } };
    expect(arg.where.status).toBe('ACTIVE');
  });
});
