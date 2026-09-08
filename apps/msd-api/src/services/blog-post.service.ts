import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma } from '../generated/prisma-client';
import type { BlogPostCreateSchema, BlogPostUpdateSchema } from '../schemas/blog-post.schema';
import * as mediaService from './media.service';
import type { MediaFile } from './media.service';

type BlogPostCreateInput = z.infer<typeof BlogPostCreateSchema>;
type BlogPostUpdateInput = z.infer<typeof BlogPostUpdateSchema>;

/** Declared outside any `as const` object (and explicitly typed, not inferred) so `orderBy`
 *  stays the mutable array Prisma's generated types expect — see `category.service.ts`'s
 *  identical `CATEGORY_IMAGE_ORDER_BY` doc comment for the `as const` freezing gotcha this avoids. */
const BLOG_POST_IMAGE_ORDER_BY: Prisma.BlogPostImageOrderByWithRelationInput[] = [
  { isPrimary: 'desc' },
  { sortOrder: 'asc' },
];

/** The full admin CRUD list — paginated, every status included unless `status` narrows it (the
 *  admin caller is already permission-gated on 'cms.blog:view', unlike the public catalog read —
 *  see `getPublishedBlogPosts` below, which hard-codes PUBLISHED and never accepts this param). */
export async function listBlogPosts(opts: {
  page: number;
  pageSize: number;
  search?: string;
  status?: 'DRAFT' | 'PUBLISHED';
  categorySlug?: string;
}) {
  const where = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.categorySlug ? { categorySlug: opts.categorySlug } : {}),
    ...(opts.search ? { title: { contains: opts.search, mode: 'insensitive' as const } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: { mediaImages: { orderBy: BLOG_POST_IMAGE_ORDER_BY } },
    }),
    prisma.blogPost.count({ where }),
  ]);
  return { items, total };
}

export async function getBlogPostOrThrow(id: string) {
  const post = await prisma.blogPost.findUnique({
    where: { id },
    include: { mediaImages: { orderBy: BLOG_POST_IMAGE_ORDER_BY } },
  });
  if (!post) throw new ApiError('NOT_FOUND', 'Blog post not found');
  return post;
}

async function assertSlugAvailable(slug: string, excludeId?: string) {
  const existing = await prisma.blogPost.findUnique({ where: { slug } });
  if (existing && existing.id !== excludeId) {
    throw new ApiError('CONFLICT', `Blog post slug "${slug}" already exists`);
  }
}

export async function createBlogPost(input: BlogPostCreateInput) {
  await assertSlugAvailable(input.slug);
  // App-layer pre-check above is a racy read, not an atomic guarantee — BlogPost.slug's DB-level
  // @unique is the hard backstop, same discipline as category.service.ts#createCategory.
  try {
    return await prisma.blogPost.create({
      data: { ...input, body: input.body as Prisma.InputJsonValue, tags: input.tags as Prisma.InputJsonValue },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ApiError('CONFLICT', `Blog post slug "${input.slug}" already exists`);
    }
    throw err;
  }
}

export async function updateBlogPost(id: string, input: BlogPostUpdateInput) {
  await getBlogPostOrThrow(id);
  if (input.slug) await assertSlugAvailable(input.slug, id);
  return prisma.blogPost.update({
    where: { id },
    data: {
      ...input,
      ...(input.body ? { body: input.body as Prisma.InputJsonValue } : {}),
      ...(input.tags ? { tags: input.tags as Prisma.InputJsonValue } : {}),
    },
  });
}

/** DRAFT -> PUBLISHED sets `publishedAt` only the first time (never overwrites an
 *  already-published post's original publish date on a later PUBLISHED -> DRAFT -> PUBLISHED
 *  round trip). Any other transition leaves `publishedAt` untouched. */
export async function setBlogPostStatus(id: string, status: 'DRAFT' | 'PUBLISHED') {
  const post = await getBlogPostOrThrow(id);
  const publishedAt = status === 'PUBLISHED' && !post.publishedAt ? new Date() : post.publishedAt;
  return prisma.blogPost.update({ where: { id }, data: { status, publishedAt } });
}

export async function deleteBlogPost(id: string) {
  await getBlogPostOrThrow(id);
  await prisma.blogPost.delete({ where: { id } });
}

// ─── BlogPost media (shared upload system — see media.service.ts's doc comment). ───────────────

export async function addBlogPostImage(blogPostId: string, file: MediaFile) {
  await getBlogPostOrThrow(blogPostId);
  return mediaService.addImage('blog', blogPostId, file);
}

export async function deleteBlogPostImage(blogPostId: string, imageId: string) {
  await getBlogPostOrThrow(blogPostId);
  return mediaService.deleteImage('blog', blogPostId, imageId);
}

export async function reorderBlogPostImages(blogPostId: string, orderedImageIds: string[]) {
  await getBlogPostOrThrow(blogPostId);
  return mediaService.reorderImages('blog', blogPostId, orderedImageIds);
}

export async function setBlogPostPrimaryImage(blogPostId: string, imageId: string) {
  await getBlogPostOrThrow(blogPostId);
  return mediaService.setPrimaryImage('blog', blogPostId, imageId);
}

// ─── Public reads (GET /catalog/blog-posts*, no auth) — hard-codes `status: 'PUBLISHED'` server
// side, mirroring catalog.service.ts's VISIBLE_DEAL_WHERE convention exactly: never accepts or
// trusts a caller-supplied status/visibility param. ──────────────────────────────────────────

const PUBLIC_BLOG_POST_SELECT = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  categorySlug: true,
  body: true,
  author: true,
  readMinutes: true,
  tags: true,
  publishedAt: true,
  // SEO overrides for the public post page (see schema.prisma's own doc comment on these
  // columns) — must round-trip on the public read, unlike most of this select's other
  // admin-only-looking fields, since this is the one place a frontend <title>/<meta
  // name="description"> actually consumes them.
  metaTitle: true,
  metaDescription: true,
  mediaImages: { orderBy: BLOG_POST_IMAGE_ORDER_BY, select: { id: true, storageKey: true, isPrimary: true, sortOrder: true } },
} as const;

export async function getPublishedBlogPosts(opts: {
  page: number;
  pageSize: number;
  search?: string;
  categorySlug?: string;
}) {
  const where = {
    status: 'PUBLISHED' as const,
    ...(opts.categorySlug ? { categorySlug: opts.categorySlug } : {}),
    ...(opts.search ? { title: { contains: opts.search, mode: 'insensitive' as const } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      orderBy: [{ publishedAt: 'desc' }],
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: PUBLIC_BLOG_POST_SELECT,
    }),
    prisma.blogPost.count({ where }),
  ]);
  return { items, total };
}

export async function getPublishedBlogPostBySlugOrThrow(slug: string) {
  const post = await prisma.blogPost.findFirst({
    where: { slug, status: 'PUBLISHED' },
    select: PUBLIC_BLOG_POST_SELECT,
  });
  if (!post) throw new ApiError('NOT_FOUND', 'Blog post not found');
  return post;
}
