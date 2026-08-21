import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { assertCategoryChildOf } from './category.service';
import * as mediaService from './media.service';
import type { MediaFile } from './media.service';
import type { Prisma } from '../generated/prisma-client';
import type { ProductCreateSchema, ProductUpdateSchema } from '../schemas/product.schema';

type ProductCreateInput = z.infer<typeof ProductCreateSchema>;
type ProductUpdateInput = z.infer<typeof ProductUpdateSchema>;

/** Declared outside CATEGORY_INCLUDE's own `as const` (and explicitly typed, not inferred) so
 *  its `orderBy` stays the mutable array Prisma's generated types expect — nesting a plain array
 *  literal directly inside an `as const` object freezes it into a readonly tuple, which
 *  `ProductImageOrderByWithRelationInput[]` rejects (caught by the webpack/ts-loader production
 *  build, not by a plain `tsc --noEmit` run — same gotcha as vendor.service.ts's
 *  DEAL_PACKAGE_ORDER_BY). */
const PRODUCT_IMAGE_ORDER_BY: Prisma.ProductImageOrderByWithRelationInput[] = [
  { isPrimary: 'desc' },
  { sortOrder: 'asc' },
];

const CATEGORY_INCLUDE = {
  category: { select: { id: true, name: true } },
  subcategory: { select: { id: true, name: true } },
  mediaImages: { orderBy: PRODUCT_IMAGE_ORDER_BY },
  mediaVideo: true,
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

// ─── Product media (shared upload system — see media.service.ts's doc comment for the full
// architecture; Product has no vendor/branch scoping, gated by permission only, so "ownership"
// here is just "does this Product exist") ─────────────────────────────────────

export async function addProductImage(productId: string, file: MediaFile) {
  await getProductOrThrow(productId);
  return mediaService.addImage('product', productId, file);
}

export async function deleteProductImage(productId: string, imageId: string) {
  await getProductOrThrow(productId);
  return mediaService.deleteImage('product', productId, imageId);
}

export async function reorderProductImages(productId: string, orderedImageIds: string[]) {
  await getProductOrThrow(productId);
  return mediaService.reorderImages('product', productId, orderedImageIds);
}

export async function setProductPrimaryImage(productId: string, imageId: string) {
  await getProductOrThrow(productId);
  return mediaService.setPrimaryImage('product', productId, imageId);
}

export async function replaceProductVideo(productId: string, file: MediaFile) {
  await getProductOrThrow(productId);
  return mediaService.replaceVideo('product', productId, file);
}

export async function deleteProductVideo(productId: string) {
  await getProductOrThrow(productId);
  return mediaService.deleteVideo('product', productId);
}
