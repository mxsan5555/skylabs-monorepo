import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma } from '../generated/prisma-client';
import type { PopularTagCreateSchema, PopularTagUpdateSchema } from '../schemas/popular-tag.schema';

type PopularTagCreateInput = z.infer<typeof PopularTagCreateSchema>;
type PopularTagUpdateInput = z.infer<typeof PopularTagUpdateSchema>;
export type PopularTagTargetType = 'category' | 'deal' | 'product' | 'therapist';

/**
 * Dynamic Superadmin-managed marketing labels ("Trending", "Best Seller", ...), mappable onto
 * any mix of Category/Deal/Product/Therapist rows. Mirrors `category.service.ts`'s CRUD shape
 * exactly (slug-uniqueness pre-check + P2002 backstop, `getTagOrThrow`/`setTagStatus`/
 * `deleteTag` guard pattern). `isActive` is the only thing a deactivate/reactivate toggle
 * touches — mapping rows are never created/deleted by a status change (see `PopularTag`'s own
 * schema doc comment), so reactivating instantly restores every existing mapping.
 */

async function assertSlugAvailable(slug: string, excludeId?: string) {
  const existing = await prisma.popularTag.findUnique({ where: { slug } });
  if (existing && existing.id !== excludeId) {
    throw new ApiError('CONFLICT', `Popular tag slug "${slug}" already exists`);
  }
}

export async function listTags(opts: { page: number; pageSize: number; search?: string }) {
  const where = opts.search ? { name: { contains: opts.search, mode: 'insensitive' as const } } : {};
  const [items, total] = await Promise.all([
    prisma.popularTag.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: {
        _count: { select: { categories: true, deals: true, products: true, therapists: true } },
      },
    }),
    prisma.popularTag.count({ where }),
  ]);
  return { items, total };
}

export async function getTagOrThrow(id: string) {
  const tag = await prisma.popularTag.findUnique({
    where: { id },
    include: {
      _count: { select: { categories: true, deals: true, products: true, therapists: true } },
    },
  });
  if (!tag) throw new ApiError('NOT_FOUND', 'Popular tag not found');
  return tag;
}

export async function createTag(input: PopularTagCreateInput) {
  await assertSlugAvailable(input.slug);
  try {
    return await prisma.popularTag.create({ data: input });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ApiError('CONFLICT', `Popular tag slug "${input.slug}" already exists`);
    }
    throw err;
  }
}

export async function updateTag(id: string, input: PopularTagUpdateInput) {
  await getTagOrThrow(id);
  if (input.slug) await assertSlugAvailable(input.slug, id);
  return prisma.popularTag.update({ where: { id }, data: input });
}

export async function setTagStatus(id: string, isActive: boolean) {
  await getTagOrThrow(id);
  return prisma.popularTag.update({ where: { id }, data: { isActive } });
}

export async function deleteTag(id: string) {
  const tag = await getTagOrThrow(id);
  const mappedCount = tag._count.categories + tag._count.deals + tag._count.products + tag._count.therapists;
  if (mappedCount > 0) {
    throw new ApiError('CONFLICT', 'Popular tag still has mappings; unmap it from every item first');
  }
  await prisma.popularTag.delete({ where: { id } });
}

// ─── Mappings — one real join table per target entity (not a polymorphic entityType/entityId
// column), matching this schema's own established convention (see PopularTag's doc comment). ──

async function assertTargetExists(targetType: PopularTagTargetType, targetId: string) {
  const exists = await (
    {
      category: () => prisma.category.findUnique({ where: { id: targetId } }),
      deal: () => prisma.deal.findUnique({ where: { id: targetId } }),
      product: () => prisma.product.findUnique({ where: { id: targetId } }),
      therapist: () => prisma.therapist.findUnique({ where: { id: targetId } }),
    }[targetType]()
  );
  if (!exists) throw new ApiError('VALIDATION_ERROR', `${targetType} does not exist`);
}

export async function mapTag(tagId: string, targetType: PopularTagTargetType, targetId: string) {
  await getTagOrThrow(tagId);
  await assertTargetExists(targetType, targetId);

  if (targetType === 'category') {
    return prisma.popularTagCategory.upsert({
      where: { tagId_categoryId: { tagId, categoryId: targetId } },
      update: {},
      create: { tagId, categoryId: targetId },
    });
  }
  if (targetType === 'deal') {
    return prisma.popularTagDeal.upsert({
      where: { tagId_dealId: { tagId, dealId: targetId } },
      update: {},
      create: { tagId, dealId: targetId },
    });
  }
  if (targetType === 'product') {
    return prisma.popularTagProduct.upsert({
      where: { tagId_productId: { tagId, productId: targetId } },
      update: {},
      create: { tagId, productId: targetId },
    });
  }
  return prisma.popularTagTherapist.upsert({
    where: { tagId_therapistId: { tagId, therapistId: targetId } },
    update: {},
    create: { tagId, therapistId: targetId },
  });
}

export async function unmapTag(tagId: string, targetType: PopularTagTargetType, targetId: string) {
  await getTagOrThrow(tagId);
  if (targetType === 'category') {
    await prisma.popularTagCategory.deleteMany({ where: { tagId, categoryId: targetId } });
    return;
  }
  if (targetType === 'deal') {
    await prisma.popularTagDeal.deleteMany({ where: { tagId, dealId: targetId } });
    return;
  }
  if (targetType === 'product') {
    await prisma.popularTagProduct.deleteMany({ where: { tagId, productId: targetId } });
    return;
  }
  await prisma.popularTagTherapist.deleteMany({ where: { tagId, therapistId: targetId } });
}

export async function listMappings(tagId: string) {
  await getTagOrThrow(tagId);
  const [categories, deals, products, therapists] = await Promise.all([
    prisma.popularTagCategory.findMany({ where: { tagId }, include: { category: { select: { id: true, name: true } } } }),
    prisma.popularTagDeal.findMany({ where: { tagId }, include: { deal: { select: { id: true, title: true } } } }),
    prisma.popularTagProduct.findMany({ where: { tagId }, include: { product: { select: { id: true, name: true } } } }),
    prisma.popularTagTherapist.findMany({ where: { tagId }, include: { therapist: { select: { id: true, personName: true } } } }),
  ]);
  return {
    categories: categories.map((m) => m.category),
    deals: deals.map((m) => m.deal),
    products: products.map((m) => m.product),
    therapists: therapists.map((m) => m.therapist),
  };
}

/** Bulk lookup used to enrich public catalog responses — active tags only, unconditionally
 *  server-side (frontend hiding alone is never sufficient, per this feature's own requirement).
 *  Returns a Map so callers can attach `popularTags` per-row with one query instead of N. */
export async function getActiveTagNamesFor(
  targetType: PopularTagTargetType,
  ids: string[],
): Promise<Map<string, { id: string; name: string; slug: string }[]>> {
  const result = new Map<string, { id: string; name: string; slug: string }[]>();
  if (ids.length === 0) return result;

  const push = (targetId: string, tag: { id: string; name: string; slug: string }) => {
    const list = result.get(targetId) ?? [];
    list.push(tag);
    result.set(targetId, list);
  };

  if (targetType === 'category') {
    const rows = await prisma.popularTagCategory.findMany({
      where: { categoryId: { in: ids }, tag: { isActive: true } },
      include: { tag: { select: { id: true, name: true, slug: true } } },
    });
    for (const row of rows) push(row.categoryId, row.tag);
  } else if (targetType === 'deal') {
    const rows = await prisma.popularTagDeal.findMany({
      where: { dealId: { in: ids }, tag: { isActive: true } },
      include: { tag: { select: { id: true, name: true, slug: true } } },
    });
    for (const row of rows) push(row.dealId, row.tag);
  } else if (targetType === 'product') {
    const rows = await prisma.popularTagProduct.findMany({
      where: { productId: { in: ids }, tag: { isActive: true } },
      include: { tag: { select: { id: true, name: true, slug: true } } },
    });
    for (const row of rows) push(row.productId, row.tag);
  } else {
    const rows = await prisma.popularTagTherapist.findMany({
      where: { therapistId: { in: ids }, tag: { isActive: true } },
      include: { tag: { select: { id: true, name: true, slug: true } } },
    });
    for (const row of rows) push(row.therapistId, row.tag);
  }
  return result;
}
