import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import {
  createGroup,
  deleteGroup,
  setGroupStatus,
  createTreatment,
  setTreatmentStatus,
  deleteTreatment,
  getPublicTreatmentDirectory,
} from './popular-treatment.service';

const prismaMock = vi.mocked(prisma, true);

const GROUP_ID = 'group-1';
const TREATMENT_ID = 'treatment-1';
const CATEGORY_ID = 'cat-1';

const groupFixture = { id: GROUP_ID, name: 'Massage', slug: 'massage', sortOrder: 0, isActive: true };
const treatmentFixture = { id: TREATMENT_ID, groupId: GROUP_ID, name: 'Swedish Massage', slug: 'swedish-massage', categoryId: null, subcategoryId: null, sortOrder: 0, isActive: true };

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Feature: Popular Treatments — Group CRUD
 * Scenario: mirrors `popular-tag.service.ts`'s own CRUD test coverage shape — slug uniqueness,
 * delete-blocked-while-non-empty, and the "deactivate never deletes" discipline (see
 * `PopularTreatmentGroup`'s schema doc comment).
 */
describe('PopularTreatmentGroup CRUD', () => {
  it('createGroup rejects a duplicate slug with CONFLICT', async () => {
    prismaMock.popularTreatmentGroup.findUnique.mockResolvedValue(groupFixture);
    await expect(createGroup({ name: 'Massage', slug: 'massage' })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prismaMock.popularTreatmentGroup.create).not.toHaveBeenCalled();
  });

  it('setGroupStatus only ever flips isActive — never touches treatments', async () => {
    prismaMock.popularTreatmentGroup.findUnique.mockResolvedValue({ ...groupFixture, _count: { treatments: 3 } });
    prismaMock.popularTreatmentGroup.update.mockResolvedValue({ ...groupFixture, isActive: false });
    await setGroupStatus(GROUP_ID, false);
    expect(prismaMock.popularTreatmentGroup.update).toHaveBeenCalledWith({ where: { id: GROUP_ID }, data: { isActive: false } });
  });

  it('deleteGroup rejects with CONFLICT when the group still has treatments', async () => {
    prismaMock.popularTreatmentGroup.findUnique.mockResolvedValue({ ...groupFixture, _count: { treatments: 2 } });
    await expect(deleteGroup(GROUP_ID)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prismaMock.popularTreatmentGroup.delete).not.toHaveBeenCalled();
  });

  it('deleteGroup succeeds once the group has zero treatments', async () => {
    prismaMock.popularTreatmentGroup.findUnique.mockResolvedValue({ ...groupFixture, _count: { treatments: 0 } });
    await deleteGroup(GROUP_ID);
    expect(prismaMock.popularTreatmentGroup.delete).toHaveBeenCalledWith({ where: { id: GROUP_ID } });
  });
});

/**
 * Feature: Popular Treatments — Treatment CRUD
 * Scenario: a treatment requires a real group; an optional category/subcategory pair is
 * integrity-checked (subcategory must be a direct child of the given category) but never
 * required — the chip works on its name-text search alone. Deactivating a treatment never
 * touches any Deal/Product/Therapist row (there is no direct link to unmap/delete — see
 * `PopularTreatment`'s schema doc comment).
 */
describe('PopularTreatment CRUD', () => {
  it('createTreatment rejects when the referenced group does not exist', async () => {
    prismaMock.popularTreatment.findUnique.mockResolvedValue(null);
    prismaMock.popularTreatmentGroup.findUnique.mockResolvedValue(null);
    await expect(createTreatment({ name: 'Swedish Massage', slug: 'swedish-massage', groupId: 'missing-group' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(prismaMock.popularTreatment.create).not.toHaveBeenCalled();
  });

  it('createTreatment rejects a duplicate slug with CONFLICT', async () => {
    prismaMock.popularTreatment.findUnique.mockResolvedValue(treatmentFixture);
    await expect(createTreatment({ name: 'Swedish Massage', slug: 'swedish-massage', groupId: GROUP_ID })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('createTreatment rejects a subcategory that does not belong to the given category', async () => {
    prismaMock.popularTreatment.findUnique.mockResolvedValue(null);
    prismaMock.popularTreatmentGroup.findUnique.mockResolvedValue(groupFixture);
    prismaMock.category.findUnique
      .mockResolvedValueOnce({ id: CATEGORY_ID, parentId: null }) // category lookup
      .mockResolvedValueOnce({ id: 'sub-wrong', parentId: 'some-other-category' }); // subcategory lookup
    await expect(
      createTreatment({ name: 'Swedish Massage', slug: 'swedish-massage', groupId: GROUP_ID, categoryId: CATEGORY_ID, subcategoryId: 'sub-wrong' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.popularTreatment.create).not.toHaveBeenCalled();
  });

  it('createTreatment succeeds without a category/subcategory (both optional)', async () => {
    prismaMock.popularTreatment.findUnique.mockResolvedValue(null);
    prismaMock.popularTreatmentGroup.findUnique.mockResolvedValue(groupFixture);
    prismaMock.popularTreatment.create.mockResolvedValue(treatmentFixture);
    const result = await createTreatment({ name: 'Swedish Massage', slug: 'swedish-massage', groupId: GROUP_ID });
    expect(result).toEqual(treatmentFixture);
  });

  it('setTreatmentStatus only ever flips isActive', async () => {
    prismaMock.popularTreatment.findUnique.mockResolvedValue(treatmentFixture);
    prismaMock.popularTreatment.update.mockResolvedValue({ ...treatmentFixture, isActive: false });
    await setTreatmentStatus(TREATMENT_ID, false);
    expect(prismaMock.popularTreatment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TREATMENT_ID }, data: { isActive: false } }),
    );
  });

  it('deleteTreatment removes the row directly — no mapping/linked-listing guard (none exist)', async () => {
    prismaMock.popularTreatment.findUnique.mockResolvedValue(treatmentFixture);
    await deleteTreatment(TREATMENT_ID);
    expect(prismaMock.popularTreatment.delete).toHaveBeenCalledWith({ where: { id: TREATMENT_ID } });
  });

  it('throws NOT_FOUND for a treatment id that does not exist', async () => {
    prismaMock.popularTreatment.findUnique.mockResolvedValue(null);
    await expect(setTreatmentStatus('missing', true)).rejects.toThrow(ApiError);
  });
});

/**
 * Feature: Public Treatment directory
 * Scenario: an inactive group hides all its treatments even if individually active; an inactive
 * treatment inside an active group hides only itself; a group with zero visible treatments after
 * filtering is dropped entirely (never an empty heading).
 */
describe('getPublicTreatmentDirectory', () => {
  it('only queries active groups, and returns only their own active treatments', async () => {
    prismaMock.popularTreatmentGroup.findMany.mockResolvedValue([
      {
        id: GROUP_ID,
        name: 'Massage',
        slug: 'massage',
        treatments: [
          { id: 't1', name: 'Swedish Massage', slug: 'swedish-massage', category: { slug: 'massage-cat' } },
        ],
      },
    ]);
    const result = await getPublicTreatmentDirectory();
    expect(prismaMock.popularTreatmentGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
    expect(result).toEqual([
      { id: GROUP_ID, name: 'Massage', slug: 'massage', treatments: [{ id: 't1', name: 'Swedish Massage', slug: 'swedish-massage', categorySlug: 'massage-cat' }] },
    ]);
  });

  it('drops a group entirely from the result once every one of its treatments is filtered out (inactive)', async () => {
    prismaMock.popularTreatmentGroup.findMany.mockResolvedValue([
      { id: GROUP_ID, name: 'Massage', slug: 'massage', treatments: [] }, // isActive:true treatments where-clause already excluded the inactive one server-side
    ]);
    const result = await getPublicTreatmentDirectory();
    expect(result).toEqual([]);
  });
});
