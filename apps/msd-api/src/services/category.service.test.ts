import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import {
  assertVendorHasCategoryAccess,
  resolveTopLevelCategory,
  assertCategoryChildOf,
  createCategory,
  listActiveCategories,
} from './category.service';

const prismaMock = vi.mocked(prisma, true);

const VENDOR_ID = 'vendor-1';
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

describe('listActiveCategories vendor-grant filter', () => {
  it('reaches Type-level (grandchild) rows of a granted top-level category', async () => {
    prismaMock.vendorCategoryAccess.findMany.mockResolvedValue([{ categoryId: TOP_SERVICE_ID }]);
    prismaMock.category.findMany.mockResolvedValue([topServiceFixture, subcategoryFixture, typeFixture]);
    const result = await listActiveCategories({ vendorId: VENDOR_ID });
    expect(result).toEqual([topServiceFixture, subcategoryFixture, typeFixture]);
    expect(prismaMock.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { id: { in: [TOP_SERVICE_ID] } },
            { parentId: { in: [TOP_SERVICE_ID] } },
            { parent: { is: { parentId: { in: [TOP_SERVICE_ID] } } } },
          ]),
        }),
      }),
    );
  });
});

describe('assertVendorHasCategoryAccess', () => {
  it('passes for an allowed top-level category', async () => {
    prismaMock.category.findUnique.mockResolvedValue(topServiceFixture);
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue({ id: 'grant-1', vendorId: VENDOR_ID, categoryId: TOP_SERVICE_ID });
    await expect(assertVendorHasCategoryAccess(VENDOR_ID, TOP_SERVICE_ID, 'SERVICE')).resolves.toBeUndefined();
  });

  it('passes for an allowed subcategory, resolving to its granted parent', async () => {
    prismaMock.category.findUnique
      .mockResolvedValueOnce(subcategoryFixture)
      .mockResolvedValueOnce(topServiceFixture);
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue({ id: 'grant-1', vendorId: VENDOR_ID, categoryId: TOP_SERVICE_ID });
    await expect(assertVendorHasCategoryAccess(VENDOR_ID, SUBCATEGORY_ID, 'SERVICE')).resolves.toBeUndefined();
    // The grant lookup must use the resolved TOP-LEVEL id, never the subcategory's own id.
    expect(prismaMock.vendorCategoryAccess.findUnique).toHaveBeenCalledWith({
      where: { vendorId_categoryId: { vendorId: VENDOR_ID, categoryId: TOP_SERVICE_ID } },
    });
  });

  it('rejects when the vendor has no grant for the category', async () => {
    prismaMock.category.findUnique.mockResolvedValue(topServiceFixture);
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue(null);
    await expect(assertVendorHasCategoryAccess(VENDOR_ID, TOP_SERVICE_ID, 'SERVICE')).rejects.toThrow(ApiError);
  });

  it('rejects when the category type does not match the required module, even if some grant exists', async () => {
    prismaMock.category.findUnique.mockResolvedValue(topServiceFixture); // type SERVICE
    prismaMock.vendorCategoryAccess.findUnique.mockResolvedValue({ id: 'grant-1', vendorId: VENDOR_ID, categoryId: TOP_SERVICE_ID });
    await expect(assertVendorHasCategoryAccess(VENDOR_ID, TOP_SERVICE_ID, 'PRODUCT')).rejects.toThrow(ApiError);
    // Type mismatch is checked before the grant lookup — never even queries VendorCategoryAccess.
    expect(prismaMock.vendorCategoryAccess.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a PRODUCT category used for a THERAPY check', async () => {
    prismaMock.category.findUnique.mockResolvedValue(topProductFixture);
    await expect(assertVendorHasCategoryAccess(VENDOR_ID, TOP_PRODUCT_ID, 'THERAPY')).rejects.toThrow(ApiError);
  });
});
