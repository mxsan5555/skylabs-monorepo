import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { assertCategoryChildOf } from './category.service';
import type { ProductCreateSchema, ProductUpdateSchema } from '../schemas/product.schema';

type ProductCreateInput = z.infer<typeof ProductCreateSchema>;
type ProductUpdateInput = z.infer<typeof ProductUpdateSchema>;

const CATEGORY_INCLUDE = {
  category: { select: { id: true, name: true } },
  subcategory: { select: { id: true, name: true } },
} as const;

export async function listProducts(opts: {
  page: number;
  pageSize: number;
  search?: string;
  categoryId?: string;
  subcategoryId?: string;
  status?: 'active' | 'inactive';
}) {
  const where = {
    ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
    ...(opts.subcategoryId ? { subcategoryId: opts.subcategoryId } : {}),
    ...(opts.status ? { isActive: opts.status === 'active' } : {}),
    ...(opts.search
      ? {
          OR: [
            { name: { contains: opts.search, mode: 'insensitive' as const } },
            { brand: { contains: opts.search, mode: 'insensitive' as const } },
            { slug: { contains: opts.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: CATEGORY_INCLUDE,
    }),
    prisma.product.count({ where }),
  ]);
  return { items, total };
}

export async function getProductOrThrow(id: string) {
  const product = await prisma.product.findUnique({ where: { id }, include: CATEGORY_INCLUDE });
  if (!product) throw new ApiError('NOT_FOUND', 'Product not found');
  return product;
}

async function assertSlugAvailable(slug: string, excludeId?: string) {
  const existing = await prisma.product.findUnique({ where: { slug } });
  if (existing && existing.id !== excludeId) {
    throw new ApiError('CONFLICT', `Product slug "${slug}" already exists`);
  }
}

export async function createProduct(input: ProductCreateInput) {
  await assertSlugAvailable(input.slug);
  await assertCategoryChildOf(input.categoryId, input.subcategoryId);
  return prisma.product.create({ data: input, include: CATEGORY_INCLUDE });
}

export async function updateProduct(id: string, input: ProductUpdateInput) {
  const product = await getProductOrThrow(id);
  if (input.slug) await assertSlugAvailable(input.slug, id);
  if (input.categoryId || input.subcategoryId) {
    await assertCategoryChildOf(
      input.categoryId ?? product.categoryId,
      input.subcategoryId ?? product.subcategoryId ?? undefined,
    );
  }
  return prisma.product.update({ where: { id }, data: input, include: CATEGORY_INCLUDE });
}

export async function setProductStatus(id: string, isActive: boolean) {
  await getProductOrThrow(id);
  return prisma.product.update({ where: { id }, data: { isActive }, include: CATEGORY_INCLUDE });
}

export async function deleteProduct(id: string) {
  await getProductOrThrow(id);
  await prisma.product.delete({ where: { id } });
}
