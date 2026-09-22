import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import {
  assertVendorHasCategoryAccess,
  assertBranchHasCategoryAccess,
  assertBranchHasSubcategoryAccess,
  resolveTopLevelCategory,
  assertCategoryChildOf,
  createCategory,
  listActiveCategories,
} from './category.service';

const prismaMock = vi.mocked(prisma, true);

const VENDOR_ID = 'vendor-1';
const BRANCH_ID = 'branch-1';
const OTHER_BRANCH_ID = 'branch-2';
const TOP_SERVICE_ID = 'cat-top-service';
const TOP_PRODUCT_ID = 'cat-top-product';
const SUBCATEGORY_ID = 'cat-sub';
const OTHER_SUBCATEGORY_ID = 'cat-sub-2';
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

describe('assertBranchHasCategoryAccess', () => {
  it('passes when a BranchCategoryAccess row exists for the (already top-level) category', async () => {
    prismaMock.category.findUnique.mockResolvedValue(topServiceFixture); // resolveTopLevelCategory
    prismaMock.branchCategoryAccess.findUnique.mockResolvedValue({ id: 'bca-1', branchId: BRANCH_ID, categoryId: TOP_SERVICE_ID });
    await expect(assertBranchHasCategoryAccess(BRANCH_ID, TOP_SERVICE_ID)).resolves.toBeUndefined();
  });

  it('resolves a subcategory id to its top-level ancestor before checking the branch grant', async () => {
    prismaMock.category.findUnique
      .mockResolvedValueOnce(subcategoryFixture)
      .mockResolvedValueOnce(topServiceFixture);
    prismaMock.branchCategoryAccess.findUnique.mockResolvedValue({ id: 'bca-1', branchId: BRANCH_ID, categoryId: TOP_SERVICE_ID });
    await expect(assertBranchHasCategoryAccess(BRANCH_ID, SUBCATEGORY_ID)).resolves.toBeUndefined();
    // The branch-grant lookup must use the resolved TOP-LEVEL id, never the subcategory's own id.
    expect(prismaMock.branchCategoryAccess.findUnique).toHaveBeenCalledWith({
      where: { branchId_categoryId: { branchId: BRANCH_ID, categoryId: TOP_SERVICE_ID } },
    });
  });

  it('throws VALIDATION_ERROR when no BranchCategoryAccess row exists for this branch + category', async () => {
    prismaMock.category.findUnique.mockResolvedValue(topServiceFixture);
    prismaMock.branchCategoryAccess.findUnique.mockResolvedValue(null);
    await expect(assertBranchHasCategoryAccess(BRANCH_ID, TOP_SERVICE_ID)).rejects.toThrow(ApiError);
  });

  // Edge case: the category IS mapped, but to a DIFFERENT branch — a grant on one branch must
  // never leak into another branch's own access check.
  it('throws when the category is mapped to a different branch, not this one', async () => {
    prismaMock.category.findUnique.mockResolvedValue(topServiceFixture);
    // The mock's own lookup is keyed by branchId_categoryId, so a grant that only exists for
    // OTHER_BRANCH_ID resolves to null for BRANCH_ID.
    prismaMock.branchCategoryAccess.findUnique.mockImplementation(({ where }: { where: { branchId_categoryId: { branchId: string; categoryId: string } } }) =>
      Promise.resolve(where.branchId_categoryId.branchId === OTHER_BRANCH_ID ? { id: 'bca-1', branchId: OTHER_BRANCH_ID, categoryId: TOP_SERVICE_ID } : null),
    );
    await expect(assertBranchHasCategoryAccess(BRANCH_ID, TOP_SERVICE_ID)).rejects.toThrow(ApiError);
  });
});

describe('assertBranchHasSubcategoryAccess', () => {
  it('passes when the branch is mapped to the (already top-level) categoryId AND the subcategoryId is explicitly enabled under it', async () => {
    prismaMock.branchCategoryAccess.findUnique.mockResolvedValue({ id: 'bca-1', branchId: BRANCH_ID, categoryId: TOP_SERVICE_ID });
    prismaMock.branchSubcategoryAccess.findUnique.mockResolvedValue({ id: 'bsa-1', branchCategoryAccessId: 'bca-1', subcategoryId: SUBCATEGORY_ID });
    await expect(assertBranchHasSubcategoryAccess(BRANCH_ID, TOP_SERVICE_ID, SUBCATEGORY_ID)).resolves.toBeUndefined();
    expect(prismaMock.branchSubcategoryAccess.findUnique).toHaveBeenCalledWith({
      where: { branchCategoryAccessId_subcategoryId: { branchCategoryAccessId: 'bca-1', subcategoryId: SUBCATEGORY_ID } },
    });
  });

  it('throws VALIDATION_ERROR when the branch is not even mapped to the top-level category at all', async () => {
    prismaMock.branchCategoryAccess.findUnique.mockResolvedValue(null);
    await expect(assertBranchHasSubcategoryAccess(BRANCH_ID, TOP_SERVICE_ID, SUBCATEGORY_ID)).rejects.toThrow(ApiError);
    // Never even reaches the subcategory-level check once the category-level one already failed.
    expect(prismaMock.branchSubcategoryAccess.findUnique).not.toHaveBeenCalled();
  });

  // This is the canonical scenario from the feature spec: Branch A -> Spa -> Massage is granted,
  // Branch A -> Spa -> Facial is NOT — the category-level grant exists (Spa is mapped), but this
  // specific subcategory was never explicitly enabled under it, so it must still be rejected.
  it("throws VALIDATION_ERROR when the branch IS mapped to the category but this specific subcategory was never explicitly enabled under it (Branch A -> Spa -> Massage granted, Branch A -> Spa -> Facial NOT)", async () => {
    prismaMock.branchCategoryAccess.findUnique.mockResolvedValue({ id: 'bca-1', branchId: BRANCH_ID, categoryId: TOP_SERVICE_ID });
    // Only SUBCATEGORY_ID ("Massage") was ever enabled under this branchCategoryAccess row —
    // OTHER_SUBCATEGORY_ID ("Facial") has no BranchSubcategoryAccess row of its own.
    prismaMock.branchSubcategoryAccess.findUnique.mockResolvedValue(null);
    await expect(assertBranchHasSubcategoryAccess(BRANCH_ID, TOP_SERVICE_ID, OTHER_SUBCATEGORY_ID)).rejects.toThrow(ApiError);
  });

  // Edge case: subcategory access is per-branch, never shared — the same subcategory enabled
  // under BRANCH_ID's own BranchCategoryAccess row must not be visible when checked against a
  // different branch's row for the same top-level category.
  it('does not leak a subcategory grant from one branch into another branch check for the same category', async () => {
    // BRANCH_ID's own row is a different id than the one the (mocked) subcategory grant is tied to.
    prismaMock.branchCategoryAccess.findUnique.mockResolvedValue({ id: 'bca-branch-1', branchId: BRANCH_ID, categoryId: TOP_SERVICE_ID });
    prismaMock.branchSubcategoryAccess.findUnique.mockImplementation(({ where }: { where: { branchCategoryAccessId_subcategoryId: { branchCategoryAccessId: string; subcategoryId: string } } }) =>
      Promise.resolve(
        where.branchCategoryAccessId_subcategoryId.branchCategoryAccessId === 'bca-branch-2'
          ? { id: 'bsa-1', branchCategoryAccessId: 'bca-branch-2', subcategoryId: SUBCATEGORY_ID }
          : null,
      ),
    );
    await expect(assertBranchHasSubcategoryAccess(BRANCH_ID, TOP_SERVICE_ID, SUBCATEGORY_ID)).rejects.toThrow(ApiError);
  });
});
