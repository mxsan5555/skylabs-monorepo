import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma } from '../generated/prisma-client';
import type { BlogCategoryCreateSchema, BlogCategoryUpdateSchema } from '../schemas/blog-category.schema';

type BlogCategoryCreateInput = z.infer<typeof BlogCategoryCreateSchema>;
type BlogCategoryUpdateInput = z.infer<typeof BlogCategoryUpdateSchema>;

const BLOG_CATEGORY_ORDER_BY = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }];

/** The full admin CRUD list — paginated, every row regardless of `isActive` (the admin caller is
 *  already permission-gated on 'cms.blog-category:view' — see `listPublicBlogCategories` below
 *  for the public, active-only equivalent). */
export async function listBlogCategories(opts: { page: number; pageSize: number; search?: string }) {
  const where = {
    ...(opts.search ? { name: { contains: opts.search, mode: 'insensitive' as const } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.blogCategory.findMany({
      where,
      orderBy: BLOG_CATEGORY_ORDER_BY,
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: { _count: { select: { posts: true } } },
    }),
    prisma.blogCategory.count({ where }),
  ]);
  return { items, total };
}

export async function getBlogCategoryOrThrow(id: string) {
  const category = await prisma.blogCategory.findUnique({
    where: { id },
    include: { _count: { select: { posts: true } } },
  });
  if (!category) throw new ApiError('NOT_FOUND', 'Blog category not found');
  return category;
}

async function assertSlugAvailable(slug: string, excludeId?: string) {
  const existing = await prisma.blogCategory.findUnique({ where: { slug } });
  if (existing && existing.id !== excludeId) {
    throw new ApiError('CONFLICT', `Blog category slug "${slug}" already exists`);
  }
}

export async function createBlogCategory(input: BlogCategoryCreateInput) {
  await assertSlugAvailable(input.slug);
  // App-layer pre-check above is a racy read, not an atomic guarantee — BlogCategory.slug's
  // DB-level @unique is the hard backstop, same discipline as category.service.ts#createCategory.
  try {
    return await prisma.blogCategory.create({ data: input });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ApiError('CONFLICT', `Blog category slug "${input.slug}" already exists`);
    }
    throw err;
  }
}

export async function updateBlogCategory(id: string, input: BlogCategoryUpdateInput) {
  await getBlogCategoryOrThrow(id);
  if (input.slug) await assertSlugAvailable(input.slug, id);
  return prisma.blogCategory.update({ where: { id }, data: input });
}

export async function deleteBlogCategory(id: string) {
  const category = await getBlogCategoryOrThrow(id);
  if (category._count.posts > 0) {
    throw new ApiError('CONFLICT', 'Blog category is still referenced by one or more blog posts');
  }
  await prisma.blogCategory.delete({ where: { id } });
}

// ─── Public read (GET /catalog/blog-categories, no auth) — always `isActive: true`, never
// accepts a caller-supplied override (same "hard-coded visibility gate" convention as
// catalog.service.ts's VISIBLE_DEAL_WHERE). Only the fields the public storefront needs. ───────

export async function listPublicBlogCategories() {
  return prisma.blogCategory.findMany({
    where: { isActive: true },
    orderBy: BLOG_CATEGORY_ORDER_BY,
    select: { id: true, name: true, slug: true, description: true },
  });
}
