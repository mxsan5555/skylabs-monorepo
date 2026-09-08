import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';

extendZodWithOpenApi(z);

/**
 * One block of article body content — a discriminated union on `type`, matching
 * apps/msd/src/types/index.ts's `BlogBlock` union field-for-field (paragraph/heading/list/quote,
 * no `level` on heading and no `cite` on quote — the frontend type carries neither, so this
 * schema doesn't invent them either). Kept in sync by hand with that frontend type, same
 * discipline as PermissionAction's own "keep in sync" doc comment in schema.prisma.
 */
export const blogBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paragraph'), text: z.string().min(1) }),
  z.object({ type: z.literal('heading'), text: z.string().min(1) }),
  z.object({ type: z.literal('list'), items: z.array(z.string().min(1)).min(1) }),
  z.object({ type: z.literal('quote'), text: z.string().min(1) }),
]);

/** `search` matches title (see blog-post.service.ts's listBlogPosts); `status`/`categorySlug`
 *  narrow the admin listing — unlike the public catalog read, an admin caller MAY filter by any
 *  status (including DRAFT), since this endpoint is permission-gated on 'cms.blog:view'. */
export const BlogPostListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(200).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  categorySlug: z.string().max(160).optional(),
});

const BlogPostFieldsSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z
    .string()
    .min(2)
    .max(160)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lower-kebab-case'),
  excerpt: z.string().min(1).max(500),
  categorySlug: z.string().min(1).max(160),
  body: z.array(blogBlockSchema).min(1),
  author: z.string().min(1).max(150),
  readMinutes: z.number().int().min(1),
  tags: z.array(z.string().min(1).max(60)),
  /** Optional SEO overrides for the public post page — per this project's convention of
   *  requiring SEO meta on public-facing pages (see skylabs-vivek's role in CLAUDE.md). Never
   *  required — the frontend falls back to title/excerpt when unset. */
  metaTitle: z.string().max(200).optional(),
  metaDescription: z.string().max(300).optional(),
});

/** Public `GET /catalog/blog-posts` query — deliberately NO `status` field (unlike
 *  `BlogPostListQuerySchema` above): the public route always hard-codes PUBLISHED server-side
 *  (blog-post.service.ts#getPublishedBlogPosts) and must never accept a caller-supplied override. */
export const PublicBlogPostListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(200).optional(),
  categorySlug: z.string().max(160).optional(),
});

export const BlogPostCreateSchema = BlogPostFieldsSchema.openapi('BlogPostCreate');
export const BlogPostUpdateSchema = BlogPostFieldsSchema.partial().openapi('BlogPostUpdate');
export const BlogPostStatusUpdateSchema = z
  .object({ status: z.enum(['DRAFT', 'PUBLISHED']) })
  .openapi('BlogPostStatusUpdate');
