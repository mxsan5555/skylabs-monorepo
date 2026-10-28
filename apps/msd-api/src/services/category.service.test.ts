import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import {
  assertCategoryOfType,
  resolveTopLevelCategory,
  assertCategoryChildOf,
  createCategory,
  listActiveCategories,
} from './category.service';

const prismaMock = vi.mocked(prisma, true);

const TOP_SERVICE_ID = 'cat-top-service';
const TOP_PRODUCT_ID = 'cat-top-product';
const SUBCATEGORY_ID = 'cat-sub';
const TYPE_ID = 'cat-type';

const topServiceFixture = { id: TOP_SERVICE_ID, name: 'Beauty', parentId: null, type: 'SERVICE' };
const topProductFixture = { id: TOP_PRODUCT_ID, name: 'Beauty Products', parentId: null, type: 'PRODUCT' };
const subcategoryFixture = { id: SUBCATEGORY_ID, name: 'Hair', parentId: TOP_SERVICE_ID, type: null };
const typeFixture = { id: TYPE_ID, name: 'Haircut', parentId: SUBCATEGORY_ID, type: null };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveTopLevelCategory', () => {
  it('returns the category itself when it is already top-level', async () => {
    prismaMock.category.findUnique.mockResolvedValue(topServiceFixture);
    const result = await resolveTopLevelCategory(TOP_SERVICE_ID);
    expect(result).toEqual({ id: TOP_SERVICE_ID, type: 'SERVICE' });
    expect(prismaMock.category.findUnique).toHaveBeenCalledTimes(1);
  });

  it('resolves a subcategory to its parent', async () => {
    prismaMock.category.findUnique
      .mockResolvedValueOnce(subcategoryFixture)
      .mockResolvedValueOnce(topServiceFixture);
    const result = await resolveTopLevelCategory(SUBCATEGORY_ID);
    expect(result).toEqual({ id: TOP_SERVICE_ID, type: 'SERVICE' });
    expect(prismaMock.category.findUnique).toHaveBeenCalledTimes(2);
  });

  it('walks a Type-tier id two hops up to the real top-level row', async () => {
    prismaMock.category.findUnique
      .mockResolvedValueOnce(typeFixture)
      .mockResolvedValueOnce(subcategoryFixture)
      .mockResolvedValueOnce(topServiceFixture);
    const result = await resolveTopLevelCategory(TYPE_ID);
    expect(result).toEqual({ id: TOP_SERVICE_ID, type: 'SERVICE' });
    expect(prismaMock.category.findUnique).toHaveBeenCalledTimes(3);
  });

  it('throws VALIDATION_ERROR for a categoryId that does not exist', async () => {
    prismaMock.category.findUnique.mockResolvedValue(null);
    await expect(resolveTopLevelCategory('missing')).rejects.toThrow(ApiError);
  });
});

describe('assertCategoryChildOf', () => {
  it('accepts a direct child (Subcategory)', async () => {
    prismaMock.category.findUnique
      .mockResolvedValueOnce(topServiceFixture) // categoryId lookup
      .mockResolvedValueOnce(subcategoryFixture); // subcategoryId lookup
    await expect(assertCategoryChildOf(TOP_SERVICE_ID, SUBCATEGORY_ID)).resolves.toBeUndefined();
  });

  it('accepts a grandchild (Type-tier row nested under one of categoryId\'s subcategories)', async () => {
    prismaMock.category.findUnique
      .mockResolvedValueOnce(topServiceFixture) // categoryId lookup
      .mockResolvedValueOnce(typeFixture) // subcategoryId (actually Type-tier) lookup
      .mockResolvedValueOnce(subcategoryFixture); // walk up: Type's own parent
    await expect(assertCategoryChildOf(TOP_SERVICE_ID, TYPE_ID)).resolves.toBeUndefined();
  });

  it('rejects a Type-tier row that is not actually under categoryId', async () => {
    prismaMock.category.findUnique
      .mockResolvedValueOnce(topProductFixture) // categoryId lookup (unrelated top-level)
      .mockResolvedValueOnce(typeFixture)
      .mockResolvedValueOnce(subcategoryFixture); // Type's parent resolves to TOP_SERVICE_ID, not TOP_PRODUCT_ID
    await expect(assertCategoryChildOf(TOP_PRODUCT_ID, TYPE_ID)).rejects.toThrow(ApiError);
  });
});

describe('createCategory (assertValidParent depth limit)', () => {
  it('accepts creating a depth-3 (Type) row under an existing Subcategory', async () => {
    prismaMock.category.findUnique
      .mockResolvedValueOnce(null) // slug free
      .mockResolvedValueOnce(subcategoryFixture) // parent lookup — parentId set (SUBCATEGORY is depth 2)
      .mockResolvedValueOnce(topServiceFixture); // grandparent lookup — top-level, parentId null
    prismaMock.category.create.mockResolvedValue({ id: 'new-type', name: 'Swedish Massage', slug: 'swedish-massage', parentId: SUBCATEGORY_ID });
    await expect(
      createCategory({ name: 'Swedish Massage', slug: 'swedish-massage', parentId: SUBCATEGORY_ID, sortOrder: 0 } as never),
    ).resolves.toBeDefined();
    expect(prismaMock.category.create).toHaveBeenCalledOnce();
  });

  it('rejects creating a depth-4 row (parent\'s grandparent already has a parent)', async () => {
    prismaMock.category.findUnique
      .mockResolvedValueOnce(null) // slug free
      .mockResolvedValueOnce(typeFixture) // parent lookup — parentId set (TYPE is depth 3)
      .mockResolvedValueOnce(subcategoryFixture); // grandparent lookup — ALSO has a parentId -> reject
    await expect(
      createCategory({ name: 'Too Deep', slug: 'too-deep', parentId: TYPE_ID, sortOrder: 0 } as never),
    ).rejects.toThrow(ApiError);
    expect(prismaMock.category.create).not.toHaveBeenCalled();
  });
});

describe('listActiveCategories (same list for every member, D10)', () => {
  it('returns every active category of the module, reaching Type-level rows, without reading grants', async () => {
    prismaMock.category.findMany.mockResolvedValue([topServiceFixture, subcategoryFixture, typeFixture]);
    const result = await listActiveCategories({ type: 'SERVICE' });
    expect(result).toEqual([topServiceFixture, subcategoryFixture, typeFixture]);
    expect(prismaMock.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          OR: [{ type: 'SERVICE' }, { parent: { is: { type: 'SERVICE' } } }, { parent: { is: { parent: { is: { type: 'SERVICE' } } } } }],
        }),
      }),
    );
    expect(prismaMock.vendorCategoryAccess.findMany).not.toHaveBeenCalled();
  });
});

describe('assertCategoryOfType (no per-member grant, D10)', () => {
  it('passes a PRODUCT category without reading any vendor grant', async () => {
    prismaMock.category.findUnique.mockResolvedValue(topProductFixture);
    await expect(assertCategoryOfType(TOP_PRODUCT_ID, 'PRODUCT')).resolves.toBeUndefined();
    expect(prismaMock.vendorCategoryAccess.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a SERVICE category used for a PRODUCT check', async () => {
    prismaMock.category.findUnique.mockResolvedValue(topServiceFixture);
    await expect(assertCategoryOfType(TOP_SERVICE_ID, 'PRODUCT')).rejects.toThrow(ApiError);
  });
});
