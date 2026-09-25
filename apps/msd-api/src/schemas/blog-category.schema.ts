import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';

extendZodWithOpenApi(z);

const slugString = z
  .string()
  .min(2)
  .max(160)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lower-kebab-case');

/** Admin listing (`GET /blog-categories`) — `search` matches `name` (see
 *  blog-category.service.ts#listBlogCategories). Every row is returned regardless of `isActive`
 *  (the admin caller is already permission-gated on 'cms.blog-category:view') — only the public
 *  read (`GET /catalog/blog-categories`) hard-codes active-only. */
export const BlogCategoryListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(200).optional(),
});

const BlogCategoryFieldsSchema = z.object({
  name: z.string().min(1).max(150),
  slug: slugString,
  description: z.string().max(2000).optional(),
  sortOrder: z.number().int().min(0).default(0),
  /** No separate `/status` route for this resource (unlike Category/Faq) — `isActive` is a
   *  plain field on the same `PATCH /blog-categories/{id}` route as every other field. */
  isActive: z.boolean().optional(),
});

export const BlogCategoryCreateSchema = BlogCategoryFieldsSchema.openapi('BlogCategoryCreate');
export const BlogCategoryUpdateSchema = BlogCategoryFieldsSchema.partial().openapi('BlogCategoryUpdate');
