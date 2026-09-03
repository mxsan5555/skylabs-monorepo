import { describe, it, expect } from 'vitest';
import { resolveCategoryTiers } from './category-tree';

/**
 * Feature: 3-tier category cascade math (`resolveCategoryTiers`)
 * Scenario: derives the Subcategory/Type picker state from a single `subcategoryId`, which may
 * itself be a Subcategory (depth 1) or a Type (depth 2) row — see the function's own doc comment.
 *
 * Given: a flat, granted-categories list containing a 3-level chain (Massage -> Body Massage ->
 *        Swedish Massage) and a 2-level chain with no Type tier (Home Services -> Cleaning)
 * When: resolveCategoryTiers is called with various (categoryId, subcategoryId) combinations
 * Then: subcategoryOptions/typeOptions/subcategoryTierId/selectedTypeId reflect the correct tier
 *
 * Edge cases:
 * - a Subcategory with zero children yields empty typeOptions (3rd picker never renders)
 * - a stale/unknown subcategoryId (references a deleted row) doesn't throw and degrades safely
 * - no categoryId selected at all (fresh "Add" form before any pick)
 */

const TOP_MASSAGE = { id: 'top-massage', parentId: null };
const SUB_BODY_MASSAGE = { id: 'sub-body-massage', parentId: 'top-massage' };
const TYPE_SWEDISH = { id: 'type-swedish', parentId: 'sub-body-massage' };
const TYPE_DEEP_TISSUE = { id: 'type-deep-tissue', parentId: 'sub-body-massage' };

const TOP_HOME_SERVICES = { id: 'top-home-services', parentId: null };
const SUB_CLEANING = { id: 'sub-cleaning', parentId: 'top-home-services' };

const ALL_CATEGORIES = [
  TOP_MASSAGE,
  SUB_BODY_MASSAGE,
  TYPE_SWEDISH,
  TYPE_DEEP_TISSUE,
  TOP_HOME_SERVICES,
  SUB_CLEANING,
];

describe('resolveCategoryTiers', () => {
  it('returns empty subcategory/type options when no top-level category is selected yet', () => {
    const result = resolveCategoryTiers(ALL_CATEGORIES, undefined, undefined);
    expect(result.subcategoryOptions).toEqual([]);
    expect(result.typeOptions).toEqual([]);
    expect(result.subcategoryTierId).toBeUndefined();
    expect(result.selectedTypeId).toBeUndefined();
  });

  it('lists direct children of the chosen top-level category as subcategoryOptions', () => {
    const result = resolveCategoryTiers(ALL_CATEGORIES, TOP_MASSAGE.id, undefined);
    expect(result.subcategoryOptions).toEqual([SUB_BODY_MASSAGE]);
    expect(result.typeOptions).toEqual([]);
    expect(result.subcategoryTierId).toBeUndefined();
    expect(result.selectedTypeId).toBeUndefined();
  });

  it('when a real Subcategory (depth 1) is picked, exposes its children as typeOptions and reports no selectedTypeId', () => {
    const result = resolveCategoryTiers(ALL_CATEGORIES, TOP_MASSAGE.id, SUB_BODY_MASSAGE.id);
    expect(result.subcategoryTierId).toBe(SUB_BODY_MASSAGE.id);
    expect(result.typeOptions).toEqual([TYPE_SWEDISH, TYPE_DEEP_TISSUE]);
    expect(result.selectedTypeId).toBeUndefined();
  });

  it('when a Type (depth 2) is picked directly as subcategoryId, derives subcategoryTierId from its parent and reports it as selectedTypeId', () => {
    const result = resolveCategoryTiers(ALL_CATEGORIES, TOP_MASSAGE.id, TYPE_SWEDISH.id);
    expect(result.subcategoryTierId).toBe(SUB_BODY_MASSAGE.id);
    expect(result.typeOptions).toEqual([TYPE_SWEDISH, TYPE_DEEP_TISSUE]);
    expect(result.selectedTypeId).toBe(TYPE_SWEDISH.id);
    // The Subcategory select itself still resolves to the parent Subcategory, not the Type.
    expect(result.subcategoryOptions).toEqual([SUB_BODY_MASSAGE]);
  });

  // Edge case: a Subcategory with zero children (2-level-only branch, e.g. Home Services ->
  // Cleaning) — typeOptions must be empty so the 3rd picker never renders, and the existing
  // 2-level flow is completely unaffected.
  it('yields empty typeOptions for a Subcategory with no children (2-level branch, e.g. Home Services -> Cleaning)', () => {
    const result = resolveCategoryTiers(ALL_CATEGORIES, TOP_HOME_SERVICES.id, SUB_CLEANING.id);
    expect(result.subcategoryTierId).toBe(SUB_CLEANING.id);
    expect(result.typeOptions).toEqual([]);
    expect(result.selectedTypeId).toBeUndefined();
  });

  // Edge case: a stale subcategoryId that no longer exists in the categories list (e.g. the row
  // was deleted server-side but the form still holds its old id) — must degrade safely, never throw.
  it('does not throw for a stale/unknown subcategoryId and falls back to treating it as a plain (non-Type) pick', () => {
    expect(() => resolveCategoryTiers(ALL_CATEGORIES, TOP_MASSAGE.id, 'deleted-row-id')).not.toThrow();
    const result = resolveCategoryTiers(ALL_CATEGORIES, TOP_MASSAGE.id, 'deleted-row-id');
    expect(result.subcategoryTierId).toBe('deleted-row-id');
    expect(result.typeOptions).toEqual([]);
    expect(result.selectedTypeId).toBeUndefined();
  });

  // Edge case: subcategoryId set without any categoryId (shouldn't normally happen via the UI,
  // but the pure function must not crash) — subcategoryOptions is driven purely by categoryId, so
  // it's empty, while the Type derivation (driven by subcategoryId alone) still works correctly.
  it('derives Type-tier state from subcategoryId alone, independent of whether categoryId is set', () => {
    const result = resolveCategoryTiers(ALL_CATEGORIES, undefined, TYPE_SWEDISH.id);
    expect(result.subcategoryOptions).toEqual([]);
    expect(result.subcategoryTierId).toBe(SUB_BODY_MASSAGE.id);
    expect(result.selectedTypeId).toBe(TYPE_SWEDISH.id);
  });

  it('empty categories list never throws and returns all-empty tiers', () => {
    const result = resolveCategoryTiers([], TOP_MASSAGE.id, TYPE_SWEDISH.id);
    expect(result.subcategoryOptions).toEqual([]);
    expect(result.typeOptions).toEqual([]);
    expect(result.subcategoryTierId).toBe(TYPE_SWEDISH.id);
    expect(result.selectedTypeId).toBeUndefined();
  });
});
