import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma } from '../generated/prisma-client';
import type {
  PopularTreatmentGroupCreateSchema,
  PopularTreatmentGroupUpdateSchema,
  PopularTreatmentCreateSchema,
  PopularTreatmentUpdateSchema,
} from '../schemas/popular-treatment.schema';

type GroupCreateInput = z.infer<typeof PopularTreatmentGroupCreateSchema>;
type GroupUpdateInput = z.infer<typeof PopularTreatmentGroupUpdateSchema>;
type TreatmentCreateInput = z.infer<typeof PopularTreatmentCreateSchema>;
type TreatmentUpdateInput = z.infer<typeof PopularTreatmentUpdateSchema>;

/**
 * "Popular Treatments" — the public home page's Treatment directory (groups like "Massage" each
 * holding chips like "Swedish Massage"). A chip is a search shortcut (`/explore?q=<name>`), never
 * a direct link to a specific Deal/Product/Therapist row — see `PopularTreatment`'s own schema
 * doc comment for why this has no mapping join tables the way `PopularTag` does. Mirrors
 * `category.service.ts`/`popular-tag.service.ts`'s exact CRUD shape (slug-uniqueness pre-check +
 * P2002 backstop, `getXOrThrow`/`setXStatus` guard pattern).
 */

// ─── Groups ────────────────────────────────────────────────────────────────────────────────

async function assertGroupSlugAvailable(slug: string, excludeId?: string) {
  const existing = await prisma.popularTreatmentGroup.findUnique({ where: { slug } });
  if (existing && existing.id !== excludeId) {
    throw new ApiError('CONFLICT', `Popular treatment group slug "${slug}" already exists`);
  }
}

export async function listGroups(opts: { page: number; pageSize: number; search?: string }) {
  const where = opts.search ? { name: { contains: opts.search, mode: 'insensitive' as const } } : {};
  const [items, total] = await Promise.all([
    prisma.popularTreatmentGroup.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: { _count: { select: { treatments: true } } },
    }),
    prisma.popularTreatmentGroup.count({ where }),
  ]);
  return { items, total };
}

/** Unfiltered — every group, active or not, for the Treatment form's Group picker (an admin
 *  editing an inactive treatment must still see/keep its inactive group selected). */
export async function listAllGroups() {
  return prisma.popularTreatmentGroup.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
}

export async function getGroupOrThrow(id: string) {
  const group = await prisma.popularTreatmentGroup.findUnique({
    where: { id },
    include: { _count: { select: { treatments: true } } },
  });
  if (!group) throw new ApiError('NOT_FOUND', 'Popular treatment group not found');
  return group;
}

export async function createGroup(input: GroupCreateInput) {
  await assertGroupSlugAvailable(input.slug);
  try {
    return await prisma.popularTreatmentGroup.create({ data: input });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ApiError('CONFLICT', `Popular treatment group slug "${input.slug}" already exists`);
    }
    throw err;
  }
}

export async function updateGroup(id: string, input: GroupUpdateInput) {
  await getGroupOrThrow(id);
  if (input.slug) await assertGroupSlugAvailable(input.slug, id);
  return prisma.popularTreatmentGroup.update({ where: { id }, data: input });
}

export async function setGroupStatus(id: string, isActive: boolean) {
  await getGroupOrThrow(id);
  return prisma.popularTreatmentGroup.update({ where: { id }, data: { isActive } });
}

export async function deleteGroup(id: string) {
  const group = await getGroupOrThrow(id);
  if (group._count.treatments > 0) {
    throw new ApiError('CONFLICT', 'This group still has treatments; delete or move them first');
  }
  await prisma.popularTreatmentGroup.delete({ where: { id } });
}

// ─── Treatments ────────────────────────────────────────────────────────────────────────────

async function assertTreatmentSlugAvailable(slug: string, excludeId?: string) {
  const existing = await prisma.popularTreatment.findUnique({ where: { slug } });
  if (existing && existing.id !== excludeId) {
    throw new ApiError('CONFLICT', `Popular treatment slug "${slug}" already exists`);
  }
}

const TREATMENT_INCLUDE = {
  group: { select: { id: true, name: true, slug: true, isActive: true } },
  category: { select: { id: true, name: true, slug: true } },
  subcategory: { select: { id: true, name: true, slug: true } },
} as const;

export async function listTreatments(opts: { page: number; pageSize: number; search?: string; groupId?: string }) {
  const where: Prisma.PopularTreatmentWhereInput = {
    ...(opts.search ? { name: { contains: opts.search, mode: 'insensitive' as const } } : {}),
    ...(opts.groupId ? { groupId: opts.groupId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.popularTreatment.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: TREATMENT_INCLUDE,
    }),
    prisma.popularTreatment.count({ where }),
  ]);
  return { items, total };
}

export async function getTreatmentOrThrow(id: string) {
  const treatment = await prisma.popularTreatment.findUnique({ where: { id }, include: TREATMENT_INCLUDE });
  if (!treatment) throw new ApiError('NOT_FOUND', 'Popular treatment not found');
  return treatment;
}

async function assertGroupExists(groupId: string) {
  const group = await prisma.popularTreatmentGroup.findUnique({ where: { id: groupId } });
  if (!group) throw new ApiError('VALIDATION_ERROR', 'Selected group does not exist');
}

/** A `subcategoryId` must be a direct child of `categoryId` when both are given — same
 *  parent/child integrity check as Deal/Product's own category pickers. */
async function assertCategoryPair(categoryId: string | null | undefined, subcategoryId: string | null | undefined) {
  if (!categoryId && subcategoryId) {
    throw new ApiError('VALIDATION_ERROR', 'A subcategory requires a category to be selected first');
  }
  if (categoryId) {
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw new ApiError('VALIDATION_ERROR', 'Selected category does not exist');
  }
  if (subcategoryId) {
    const subcategory = await prisma.category.findUnique({ where: { id: subcategoryId } });
    if (!subcategory || subcategory.parentId !== categoryId) {
      throw new ApiError('VALIDATION_ERROR', 'Selected subcategory does not belong to the selected category');
    }
  }
}

export async function createTreatment(input: TreatmentCreateInput) {
  await assertTreatmentSlugAvailable(input.slug);
  await assertGroupExists(input.groupId);
  await assertCategoryPair(input.categoryId, input.subcategoryId);
  try {
    return await prisma.popularTreatment.create({
      data: input as Prisma.PopularTreatmentUncheckedCreateInput,
      include: TREATMENT_INCLUDE,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ApiError('CONFLICT', `Popular treatment slug "${input.slug}" already exists`);
    }
    throw err;
  }
}

export async function updateTreatment(id: string, input: TreatmentUpdateInput) {
  const existing = await getTreatmentOrThrow(id);
  if (input.slug) await assertTreatmentSlugAvailable(input.slug, id);
  if (input.groupId) await assertGroupExists(input.groupId);
  const nextCategoryId = input.categoryId !== undefined ? input.categoryId : existing.categoryId;
  const nextSubcategoryId = input.subcategoryId !== undefined ? input.subcategoryId : existing.subcategoryId;
  if (input.categoryId !== undefined || input.subcategoryId !== undefined) {
    await assertCategoryPair(nextCategoryId, nextSubcategoryId);
  }
  return prisma.popularTreatment.update({
    where: { id },
    data: input as Prisma.PopularTreatmentUncheckedUpdateInput,
    include: TREATMENT_INCLUDE,
  });
}

export async function setTreatmentStatus(id: string, isActive: boolean) {
  await getTreatmentOrThrow(id);
  return prisma.popularTreatment.update({ where: { id }, data: { isActive }, include: TREATMENT_INCLUDE });
}

export async function deleteTreatment(id: string) {
  await getTreatmentOrThrow(id);
  await prisma.popularTreatment.delete({ where: { id } });
}

// ─── Public ────────────────────────────────────────────────────────────────────────────────

/** Public home page Treatment directory — active groups only, each holding only its own active
 *  treatments (an inactive group hides all its treatments even if individually active; an
 *  inactive treatment inside an otherwise-active group hides only itself). Groups/treatments
 *  with zero visible treatments after this filter are dropped entirely rather than rendering an
 *  empty group heading. */
export async function getPublicTreatmentDirectory() {
  const groups = await prisma.popularTreatmentGroup.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      treatments: {
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, slug: true, category: { select: { slug: true } } },
      },
    },
  });
  return groups
    .filter((g) => g.treatments.length > 0)
    .map((g) => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      treatments: g.treatments.map((t) => ({ id: t.id, name: t.name, slug: t.slug, categorySlug: t.category?.slug ?? null })),
    }));
}
