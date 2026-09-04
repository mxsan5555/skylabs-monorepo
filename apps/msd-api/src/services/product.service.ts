import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { assertCategoryChildOf, assertVendorHasCategoryAccess } from './category.service';
import * as mediaService from './media.service';
import type { MediaFile } from './media.service';
import { Prisma } from '../generated/prisma-client';
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

/**
 * Superadmin, cross-vendor, read-only oversight list (mirrors `vendor.service.ts#listAllDeals`)
 * — never the create/update/delete surface, which is vendor-scoped only (self-service under
 * `/vendors/me/products`, admin-on-behalf under `/vendors/:id/products` — see products.routes.ts
 * and vendors.routes.ts).
 */
export async function listProducts(opts: {
  page: number;
  pageSize: number;
  search?: string;
  vendorId?: string;
  categoryId?: string;
  subcategoryId?: string;
  status?: 'active' | 'inactive';
}) {
  const where = {
    ...(opts.vendorId ? { vendorId: opts.vendorId } : {}),
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

/** For the superadmin oversight surface only — no vendor-ownership check. Vendor-scoped
 *  create/update/delete always goes through `getProductScopedOrThrow` below instead. */
export async function getProductOrThrow(id: string) {
  const product = await prisma.product.findUnique({ where: { id }, include: CATEGORY_INCLUDE });
  if (!product) throw new ApiError('NOT_FOUND', 'Product not found');
  return product;
}

/** 404 if the product doesn't exist at all; FORBIDDEN if it exists but belongs to a different
 *  vendor — same discipline as vendor.service.ts's getBranchScopedOrThrow/getDealScopedOrThrow/
 *  getTherapistScopedOrThrow. */
export async function getProductScopedOrThrow(vendorId: string, productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId }, include: CATEGORY_INCLUDE });
  if (!product) throw new ApiError('NOT_FOUND', 'Product not found');
  if (product.vendorId !== vendorId) throw new ApiError('FORBIDDEN', 'This product does not belong to your vendor');
  return product;
}

async function assertSlugAvailable(slug: string, excludeId?: string) {
  const existing = await prisma.product.findUnique({ where: { slug } });
  if (existing && existing.id !== excludeId) {
    throw new ApiError('CONFLICT', `Product slug "${slug}" already exists`);
  }
}

export async function createProduct(vendorId: string, input: ProductCreateInput) {
  await assertSlugAvailable(input.slug);
  await assertCategoryChildOf(input.categoryId, input.subcategoryId);
  await assertVendorHasCategoryAccess(vendorId, input.categoryId, 'PRODUCT');
  // App-layer pre-check above is a racy read, not an atomic guarantee (two near-simultaneous
  // double-submits of the same form could both pass it before either commits) — Product.slug's
  // DB-level @unique is the hard backstop, same discipline as vendor.service.ts#createDeal.
  try {
    return await prisma.product.create({ data: { ...input, vendorId }, include: CATEGORY_INCLUDE });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ApiError('CONFLICT', `Product slug "${input.slug}" already exists`);
    }
    throw err;
  }
}

export async function updateProduct(vendorId: string, productId: string, input: ProductUpdateInput) {
  const product = await getProductScopedOrThrow(vendorId, productId);
  if (input.slug) await assertSlugAvailable(input.slug, productId);
  if (input.categoryId || input.subcategoryId) {
    await assertCategoryChildOf(
      input.categoryId ?? product.categoryId,
      input.subcategoryId ?? product.subcategoryId ?? undefined,
    );
  }
  if (input.categoryId) {
    await assertVendorHasCategoryAccess(vendorId, input.categoryId, 'PRODUCT');
  }
  return prisma.product.update({ where: { id: productId }, data: input, include: CATEGORY_INCLUDE });
}

export async function setProductStatus(vendorId: string, productId: string, isActive: boolean) {
  await getProductScopedOrThrow(vendorId, productId);
  return prisma.product.update({ where: { id: productId }, data: { isActive }, include: CATEGORY_INCLUDE });
}

export async function deleteProduct(vendorId: string, productId: string) {
  await getProductScopedOrThrow(vendorId, productId);
  await prisma.product.delete({ where: { id: productId } });
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
