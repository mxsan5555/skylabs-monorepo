import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import type { CategoryCreateSchema, CategoryUpdateSchema } from '../schemas/category.schema';

type CategoryCreateInput = z.infer<typeof CategoryCreateSchema>;
type CategoryUpdateInput = z.infer<typeof CategoryUpdateSchema>;

/** The full admin CRUD list — paginated, optionally scoped to top-level or subcategory rows. */
export async function listCategories(opts: {
  page: number;
  pageSize: number;
  search?: string;
  scope?: 'top' | 'sub';
  parentId?: string;
}) {
  const where = {
    ...(opts.scope === 'top' ? { parentId: null } : {}),
    ...(opts.scope === 'sub' ? { parentId: { not: null } } : {}),
    ...(opts.parentId ? { parentId: opts.parentId } : {}),
    ...(opts.search ? { name: { contains: opts.search, mode: 'insensitive' as const } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.category.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: { parent: { select: { id: true, name: true } }, _count: { select: { children: true } } },
    }),
    prisma.category.count({ where }),
  ]);
  return { items, total };
}

/** The lean, unpaginated "active only" lookup the Deal form's category/subcategory dropdowns
 *  use — kept separate from the paginated admin list above so neither has to compromise shape. */
export async function listActiveCategories() {
  return prisma.category.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
}

/** Public "category landing page" lookup — active only, by slug (the customer catalogue's URL
 *  key), with its active children eager-loaded so the page doesn't need a second round trip. */
export async function getActiveCategoryBySlugOrThrow(slug: string) {
  const category = await prisma.category.findFirst({
    where: { slug, isActive: true },
    include: { children: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] } },
  });
  if (!category) throw new ApiError('NOT_FOUND', 'Category not found');
  return category;
}

export async function getCategoryOrThrow(id: string) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { parent: { select: { id: true, name: true } }, _count: { select: { children: true } } },
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

/** Only two levels are supported (Category → Subcategory) — a parent must itself be
 *  top-level, matching the existing Deal.category/subcategory validation's assumption. */
async function assertValidParent(parentId: string | undefined) {
  if (!parentId) return;
  const parent = await prisma.category.findUnique({ where: { id: parentId } });
  if (!parent) throw new ApiError('VALIDATION_ERROR', 'parentId does not reference an existing category');
  if (parent.parentId) throw new ApiError('VALIDATION_ERROR', 'A subcategory cannot itself be a parent (only two levels are supported)');
}

/**
 * Shared by anything that assigns a (categoryId, subcategoryId?) pair to another record
 * (Deal, Product, ...): categoryId must exist, and subcategoryId — if given — must actually
 * be a child of categoryId. One definition so this rule can't drift between callers.
 */
export async function assertCategoryChildOf(categoryId: string, subcategoryId?: string) {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) throw new ApiError('VALIDATION_ERROR', 'categoryId does not exist');
  if (subcategoryId) {
    const subcategory = await prisma.category.findUnique({ where: { id: subcategoryId } });
    if (!subcategory || subcategory.parentId !== categoryId) {
      throw new ApiError('VALIDATION_ERROR', 'subcategoryId must be a child of categoryId');
    }
  }
}

export async function createCategory(input: CategoryCreateInput) {
  await assertSlugAvailable(input.slug);
  await assertValidParent(input.parentId);
  return prisma.category.create({ data: input });
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
  const serviceCount = await prisma.service.count({ where: { OR: [{ categoryId: id }, { subcategoryId: id }] } });
  if (serviceCount > 0) {
    throw new ApiError('CONFLICT', 'Category is still referenced by one or more services');
  }
  await prisma.category.delete({ where: { id } });
}
