import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { assertItemInState, searchStateItems } from './state-catalog.service';

const prismaMock = vi.mocked(prisma, true);

const dealRow = {
  id: 'deal-1',
  title: 'Deep Tissue 60',
  salePrice: '1299.00',
  status: 'ACTIVE',
  approvalStatus: 'APPROVED',
  vendor: { businessName: 'Urban Spa', status: 'ACTIVE' },
  branch: { name: 'Hazratganj', isActive: true },
  mediaImages: [{ storageKey: 'members/m1/deals/deal-1/a.jpg' }],
};
const productRow = {
  id: 'prod-1',
  name: 'Massage Oil',
  price: '499.00',
  isActive: true,
  image: null,
  vendor: { businessName: 'Urban Spa', status: 'ACTIVE' },
  mediaImages: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.deal.findMany.mockResolvedValue([dealRow] as never);
  prismaMock.product.findMany.mockResolvedValue([productRow] as never);
});

describe('searchStateItems (D23)', () => {
  it('finds deals by their branch state', async () => {
    const items = await searchStateItems({ state: 'Uttar Pradesh', q: 'deep', type: 'deal', pageSize: 8 });
    const where = prismaMock.deal.findMany.mock.calls[0][0]!.where as Record<string, unknown>;
    expect(where).toMatchObject({ branch: { is: { state: 'Uttar Pradesh' } } });
    expect(prismaMock.product.findMany).not.toHaveBeenCalled();
    expect(items).toEqual([
      {
        type: 'deal',
        id: 'deal-1',
        title: 'Deep Tissue 60',
        memberName: 'Urban Spa',
        branchName: 'Hazratganj',
        price: '1299.00',
        image: 'members/m1/deals/deal-1/a.jpg',
        eligible: true,
      },
    ]);
  });

  it('finds products through any active branch of their member in the state', async () => {
    const items = await searchStateItems({ state: 'Uttar Pradesh', q: '', type: 'product', pageSize: 8 });
    const where = prismaMock.product.findMany.mock.calls[0][0]!.where as Record<string, unknown>;
    expect(where).toMatchObject({ vendor: { is: { branches: { some: { state: 'Uttar Pradesh', isActive: true } } } } });
    expect(items[0]).toMatchObject({ type: 'product', id: 'prod-1', title: 'Massage Oil', branchName: null, eligible: true });
  });

  it('searches every state when none is given, and returns both types for "all"', async () => {
    const items = await searchStateItems({ state: null, q: 'spa', type: 'all', pageSize: 8 });
    const dealWhere = prismaMock.deal.findMany.mock.calls[0][0]!.where as Record<string, unknown>;
    expect(dealWhere).not.toHaveProperty('branch');
    expect(items.map((i) => i.type)).toEqual(['deal', 'product']);
  });

  it('marks an item that customers cannot see as not eligible', async () => {
    prismaMock.deal.findMany.mockResolvedValue([{ ...dealRow, status: 'INACTIVE' }] as never);
    const [item] = await searchStateItems({ state: 'Uttar Pradesh', q: '', type: 'deal', pageSize: 8 });
    expect(item.eligible).toBe(false);
  });
});

describe('assertItemInState', () => {
  it('refuses a deal from another state with 422', async () => {
    prismaMock.deal.findFirst.mockResolvedValue(null);
    prismaMock.deal.findUnique.mockResolvedValue({ id: 'deal-1' } as never);
    await expect(assertItemInState('deal', 'deal-1', 'Delhi')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('accepts a product whose member has an active branch in the state', async () => {
    prismaMock.product.findFirst.mockResolvedValue({ id: 'prod-1' } as never);
    await expect(assertItemInState('product', 'prod-1', 'Uttar Pradesh')).resolves.toBeUndefined();
  });

  it('only checks that the item exists for the Global slider', async () => {
    prismaMock.product.findFirst.mockResolvedValue(null);
    prismaMock.product.findUnique.mockResolvedValue(null);
    await expect(assertItemInState('product', 'missing', null)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('searchStateItems — only visible to customers', () => {
  it('adds the storefront bar to both queries', async () => {
    await searchStateItems({ state: 'Delhi', q: '', type: 'all', pageSize: 8, eligibleOnly: true });
    expect(prismaMock.deal.findMany.mock.calls[0][0]!.where).toMatchObject({ status: 'ACTIVE', approvalStatus: 'APPROVED' });
    expect(prismaMock.product.findMany.mock.calls[0][0]!.where).toMatchObject({ isActive: true });
  });
});
