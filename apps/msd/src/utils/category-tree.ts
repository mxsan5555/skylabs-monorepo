interface CategoryLike {
  id: string;
  parentId: string | null;
}

/**
 * Shared cascade math for a flat, granted-categories list (top-level rows + their subcategories
 * AND Type-tier grandchildren, all in one array — see `listCategories({ type, vendorId })`'s own
 * doc comment in `vendor-pipeline.tsx`) used by the Deal/Product creation dialogs' Category →
 * Subcategory → (optional) Type cascade.
 *
 * `subcategoryId` here is whatever the form currently holds as the deepest picked node — it may
 * itself be a Subcategory (depth 1, e.g. "Body Massage") or a Type (depth 2, e.g. "Swedish
 * Massage") row, since `Deal.subcategoryId`/`Product.subcategoryId` accept either depth with no
 * schema distinction (see msd-api's `category.service.ts` module doc comment — "the full
 * breadcrumb is always reconstructable by walking `parentId` up"). This derives the UI's 2nd-tier
 * ("Subcategory") selection and the optional 3rd-tier ("Type") options from that single id, so
 * the dialogs don't need separate UI-only state to keep in sync with what actually gets
 * submitted — picking a Type simply becomes the new `subcategoryId`; a Subcategory with no
 * children (e.g. "Home Services" → "Cleaning") just has an empty `typeOptions` and the 3rd
 * picker never renders, so the existing 2-level flow is unaffected.
 */
export function resolveCategoryTiers<T extends CategoryLike>(
  categories: T[],
  categoryId: string | undefined,
  subcategoryId: string | undefined,
) {
  const subcategoryOptions = categories.filter((c) => c.parentId === categoryId);
  const picked = subcategoryId ? categories.find((c) => c.id === subcategoryId) : undefined;
  const pickedParent = picked?.parentId ? categories.find((c) => c.id === picked.parentId) : undefined;
  // `picked` is itself a Type-tier row iff its own parent has a parent too (depth 2).
  const pickedIsType = !!pickedParent?.parentId;
  const subcategoryTierId = pickedIsType ? (picked?.parentId ?? undefined) : subcategoryId;
  const typeOptions = subcategoryTierId ? categories.filter((c) => c.parentId === subcategoryTierId) : [];
  const selectedTypeId = pickedIsType ? subcategoryId : undefined;
  return { subcategoryOptions, typeOptions, subcategoryTierId, selectedTypeId };
}
