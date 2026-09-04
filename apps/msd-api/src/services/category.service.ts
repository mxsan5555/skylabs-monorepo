import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma, type CategoryType } from '../generated/prisma-client';
import type { CategoryCreateSchema, CategoryUpdateSchema } from '../schemas/category.schema';
import * as mediaService from './media.service';
import type { MediaFile } from './media.service';

type CategoryCreateInput = z.infer<typeof CategoryCreateSchema>;
type CategoryUpdateInput = z.infer<typeof CategoryUpdateSchema>;

/** Declared outside any `as const` object (and explicitly typed, not inferred) so `orderBy`
 *  stays the mutable array Prisma's generated types expect — see `product.service.ts`'s
 *  identical `PRODUCT_IMAGE_ORDER_BY` doc comment for the `as const` freezing gotcha this avoids. */
const CATEGORY_IMAGE_ORDER_BY: Prisma.CategoryImageOrderByWithRelationInput[] = [
  { isPrimary: 'desc' },
  { sortOrder: 'asc' },
];

/**
 * Category is a self-referential tree supporting up to THREE levels: Category (top-level,
 * `parentId: null`) → Subcategory (`parentId` -> a top-level row) → Type (`parentId` -> a
 * Subcategory row), e.g. "Massage" → "Body Massage" → "Swedish Massage". NAMING NOTE: this
 * "Type" tier is unrelated to the `Category.type` enum column (SERVICE/PRODUCT/THERAPY,
 * business-module classification, only ever set on a top-level row) — the Type tier has no
 * column/discriminator of its own, it is simply "a Category row two `parentId` hops deep."
 * `Deal.subcategoryId`/`Product.subcategoryId`/`Therapist.specializationCategoryId` accept a
 * Category row at ANY depth (Subcategory or Type) with no schema change — the full breadcrumb is
 * always reconstructable by walking `parentId` up (see `resolveTopLevelCategory`).
 */

/** The full admin CRUD list — paginated, optionally scoped to top-level, subcategory, or
 *  Type-tier ("leaf") rows. `scope=sub` means strictly depth-2 (parentId set, but that parent is
 *  itself top-level) — it deliberately excludes depth-3 "leaf" rows, which `scope=leaf` surfaces
 *  instead, so the Categories/Sub Categories/Category Types admin screens each see exactly their
 *  own tier. */
export async function listCategories(opts: {
  page: number;
  pageSize: number;
  search?: string;
  scope?: 'top' | 'sub' | 'leaf';
  parentId?: string;
}) {
  const where = {
    ...(opts.scope === 'top' ? { parentId: null } : {}),
    ...(opts.scope === 'sub' ? { parentId: { not: null }, parent: { is: { parentId: null } } } : {}),
    ...(opts.scope === 'leaf' ? { parentId: { not: null }, parent: { is: { parentId: { not: null } } } } : {}),
    ...(opts.parentId ? { parentId: opts.parentId } : {}),
    ...(opts.search ? { name: { contains: opts.search, mode: 'insensitive' as const } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.category.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { children: true } },
        mediaImages: { orderBy: CATEGORY_IMAGE_ORDER_BY },
      },
    }),
    prisma.category.count({ where }),
  ]);
  return { items, total };
}

/**
 * The lean, unpaginated "active only" lookup every vendor-facing category dropdown (Deal/
 * Product/Therapist create, the onboarding wizard's category-grant step) and the admin
 * category-tree screens use — kept separate from the paginated admin list above so neither has
 * to compromise shape.
 *
 * `type` alone filters the tree by business module (top-level rows only carry a type — a
 * subcategory or Type-tier row is included whenever its top-level ancestor matches, since
 * neither carries a type of its own — checked up to 2 hops up).
 * `vendorId` additionally scopes the result to only categories that vendor currently holds a
 * `VendorCategoryAccess` grant for (top-level rows the vendor was granted, plus their active
 * children AND grandchildren) — used everywhere a vendor picks a category to create against,
 * once they already have grants; omit it for the "grant categories" screen itself, which must
 * show every category of the enabled module regardless of what's granted yet.
 */
export async function listActiveCategories(opts: { type?: CategoryType; vendorId?: string } = {}) {
  if (!opts.vendorId) {
    return prisma.category.findMany({
      where: {
        isActive: true,
        ...(opts.type
          ? {
              OR: [
                { type: opts.type },
                { parent: { is: { type: opts.type } } },
                { parent: { is: { parent: { is: { type: opts.type } } } } },
              ],
            }
          : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  const grants = await prisma.vendorCategoryAccess.findMany({
    where: { vendorId: opts.vendorId, ...(opts.type ? { category: { is: { type: opts.type } } } : {}) },
    select: { categoryId: true },
  });
  const grantedTopLevelIds = grants.map((g) => g.categoryId);
  if (grantedTopLevelIds.length === 0) return [];

  return prisma.category.findMany({
    where: {
      isActive: true,
      OR: [
        { id: { in: grantedTopLevelIds } },
        { parentId: { in: grantedTopLevelIds } },
        { parent: { is: { parentId: { in: grantedTopLevelIds } } } },
      ],
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

/** Public "category landing page" lookup — active only, by slug (the customer catalogue's URL
 *  key), with its active children AND grandchildren eager-loaded (Subcategory[] → Type[]) so the
 *  page doesn't need a second round trip and the response can be a genuine 3-level tree — still
 *  one query (a nested Prisma `include`), not a query per level. */
export async function getActiveCategoryBySlugOrThrow(slug: string) {
  const childOrder = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }];
  const category = await prisma.category.findFirst({
    where: { slug, isActive: true },
    include: {
      children: {
        where: { isActive: true },
        orderBy: childOrder,
        include: { children: { where: { isActive: true }, orderBy: childOrder } },
      },
    },
  });
  if (!category) throw new ApiError('NOT_FOUND', 'Category not found');
  return category;
}

export async function getCategoryOrThrow(id: string) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: {
      parent: { select: { id: true, name: true } },
      _count: { select: { children: true } },
      mediaImages: { orderBy: CATEGORY_IMAGE_ORDER_BY },
    },
  });
  if (!category) throw new ApiError('NOT_FOUND', 'Category not found');
  return category;
}

async function assertSlugAvailable(slug: string, excludeId?: string) {
  const existing = await prisma.category.findUnique({ where: { slug } });
  if (existing && existing.id !== excludeId) {
    throw new ApiError('CONFLICT', `Category slug "${slug}" already exists`);
  }
}

/** Up to three levels are supported (Category → Subcategory → Type — see this file's module doc
 *  comment for the naming distinction from the unrelated `Category.type` enum column). A new
 *  row's parent may itself have a parent (making the new row a Type-tier leaf), but that
 *  parent's OWN parent (the new row's would-be grandparent) must not itself have a parent — that
 *  would make the new row a 4th level, which isn't supported. */
async function assertValidParent(parentId: string | undefined) {
  if (!parentId) return;
  const parent = await prisma.category.findUnique({ where: { id: parentId } });
  if (!parent) throw new ApiError('VALIDATION_ERROR', 'parentId does not reference an existing category');
  if (parent.parentId) {
    const grandparent = await prisma.category.findUnique({ where: { id: parent.parentId } });
    if (grandparent?.parentId) {
      throw new ApiError('VALIDATION_ERROR', 'Only three levels are supported (Category → Subcategory → Type)');
    }
  }
}

/**
 * Shared by anything that assigns a (categoryId, subcategoryId?) pair to another record
 * (Deal, Product, ...): categoryId must exist, and subcategoryId — if given — must actually
 * be a child OR a grandchild of categoryId (a direct Subcategory, or a Type-tier row nested one
 * level further under one of categoryId's subcategories). One definition so this rule can't
 * drift between callers.
 */
export async function assertCategoryChildOf(categoryId: string, subcategoryId?: string) {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) throw new ApiError('VALIDATION_ERROR', 'categoryId does not exist');
  if (!subcategoryId) return;

  const subcategory = await prisma.category.findUnique({ where: { id: subcategoryId } });
  if (!subcategory) {
    throw new ApiError('VALIDATION_ERROR', 'subcategoryId must be a child of categoryId');
  }
  if (subcategory.parentId === categoryId) return;
  if (subcategory.parentId) {
    const parent = await prisma.category.findUnique({ where: { id: subcategory.parentId } });
    if (parent?.parentId === categoryId) return;
  }
  throw new ApiError('VALIDATION_ERROR', 'subcategoryId must be a child of categoryId');
}

/**
 * Resolves any Category id (top-level, Subcategory, or Type-tier) to its top-level ancestor's id
 * + type — `VendorCategoryAccess`/business-module grants only ever exist on a top-level row, so
 * anything that needs to check "does this vendor have access to the category behind this id"
 * (a Subcategory or Type pick resolves to its top-level ancestor) goes through this one function.
 * Walks `parentId` repeatedly (not a single hardcoded hop) until reaching a row with
 * `parentId: null`, so a Type-tier id resolves correctly through its Subcategory to the real
 * top-level row. Throws if the id doesn't reference an existing category at all.
 */
export async function resolveTopLevelCategory(categoryId: string): Promise<{ id: string; type: CategoryType | null }> {
  let current = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!current) throw new ApiError('VALIDATION_ERROR', 'categoryId does not exist');
  while (current.parentId) {
    const parent = await prisma.category.findUnique({ where: { id: current.parentId } });
    if (!parent) throw new ApiError('VALIDATION_ERROR', 'categoryId does not exist');
    current = parent;
  }
  return { id: current.id, type: current.type };
}

/**
 * The actual backend enforcement of "a vendor can't create Salon deals without Salon access"
 * (frontend hiding is UX only, per this repo's established RBAC posture — see CLAUDE.md).
 * Throws VALIDATION_ERROR unless `vendorId` holds a `VendorCategoryAccess` grant for the
 * top-level category behind `categoryId` (resolving a subcategory to its parent first via
 * `resolveTopLevelCategory`) AND that top-level category's `type` matches `requiredType` — e.g.
 * a Service-granted category can never back a Product deal, even if the vendor happens to hold
 * *some* grant. Lives here (not vendor.service.ts) so both vendor.service.ts and
 * product.service.ts can import it without a circular dependency between the two.
 */
export async function assertVendorHasCategoryAccess(vendorId: string, categoryId: string, requiredType: CategoryType) {
  const topLevel = await resolveTopLevelCategory(categoryId);
  if (topLevel.type !== requiredType) {
    throw new ApiError('VALIDATION_ERROR', `This category is not a ${requiredType.toLowerCase()} category`);
  }
  const grant = await prisma.vendorCategoryAccess.findUnique({
    where: { vendorId_categoryId: { vendorId, categoryId: topLevel.id } },
  });
  if (!grant) {
    throw new ApiError('VALIDATION_ERROR', 'Your business has not been granted access to this category');
  }
}

export async function createCategory(input: CategoryCreateInput) {
  await assertSlugAvailable(input.slug);
  await assertValidParent(input.parentId);
  // App-layer pre-check above is a racy read, not an atomic guarantee — Category.slug's
  // DB-level @unique is the hard backstop, same discipline as vendor.service.ts#createDeal.
  try {
    return await prisma.category.create({ data: input });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ApiError('CONFLICT', `Category slug "${input.slug}" already exists`);
    }
    throw err;
  }
}

export async function updateCategory(id: string, input: CategoryUpdateInput) {
  const category = await getCategoryOrThrow(id);
  if (input.slug) await assertSlugAvailable(input.slug, id);
  if ('parentId' in input) {
    if (input.parentId === id) throw new ApiError('VALIDATION_ERROR', 'A category cannot be its own parent');
    if (input.parentId && category._count.children > 0) {
      throw new ApiError('VALIDATION_ERROR', 'A category with subcategories cannot itself become a subcategory');
    }
    await assertValidParent(input.parentId);
  }
  return prisma.category.update({ where: { id }, data: input });
}

export async function setCategoryStatus(id: string, isActive: boolean) {
  await getCategoryOrThrow(id);
  return prisma.category.update({ where: { id }, data: { isActive } });
}

export async function deleteCategory(id: string) {
  const category = await getCategoryOrThrow(id);
  if (category._count.children > 0) {
    throw new ApiError('CONFLICT', 'Category still has subcategories; delete or reassign them first');
  }
  const dealCount = await prisma.deal.count({ where: { OR: [{ categoryId: id }, { subcategoryId: id }] } });
  if (dealCount > 0) {
    throw new ApiError('CONFLICT', 'Category is still referenced by one or more deals');
  }
  const productCount = await prisma.product.count({ where: { OR: [{ categoryId: id }, { subcategoryId: id }] } });
  if (productCount > 0) {
    throw new ApiError('CONFLICT', 'Category is still referenced by one or more products');
  }
  const vendorAccessCount = await prisma.vendorCategoryAccess.count({ where: { categoryId: id } });
  if (vendorAccessCount > 0) {
    throw new ApiError('CONFLICT', 'Category is still granted to one or more vendors; revoke access first');
  }
  await prisma.category.delete({ where: { id } });
}

// ─── Category media (shared upload system — see media.service.ts's doc comment). One
// `CategoryImage` table automatically covers all three depth tiers (Category/Subcategory/Type
// are all just Category rows), so no per-tier wiring is needed here. No video for categories —
// see the `CategoryImage` schema doc comment. ─────────────────────────────────────────────────

export async function addCategoryImage(categoryId: string, file: MediaFile) {
  await getCategoryOrThrow(categoryId);
  return mediaService.addImage('category', categoryId, file);
}

export async function deleteCategoryImage(categoryId: string, imageId: string) {
  await getCategoryOrThrow(categoryId);
  return mediaService.deleteImage('category', categoryId, imageId);
}

export async function reorderCategoryImages(categoryId: string, orderedImageIds: string[]) {
  await getCategoryOrThrow(categoryId);
  return mediaService.reorderImages('category', categoryId, orderedImageIds);
}

export async function setCategoryPrimaryImage(categoryId: string, imageId: string) {
  await getCategoryOrThrow(categoryId);
  return mediaService.setPrimaryImage('category', categoryId, imageId);
}
