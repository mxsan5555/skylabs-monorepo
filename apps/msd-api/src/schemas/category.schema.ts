import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';

extendZodWithOpenApi(z);

const slugString = z
  .string()
  .min(2)
  .max(160)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lower-kebab-case');

/** `scope=top` → parentId is null (Categories page); `scope=sub` → parentId is set (Sub
 *  Categories page); omitted → every row. `parentId` further narrows `scope=sub` to one parent. */
export const CategoryListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(200).optional(),
  scope: z.enum(['top', 'sub']).optional(),
  parentId: z.string().uuid().optional(),
});

const CategoryFieldsSchema = z.object({
  name: z.string().min(1).max(150),
  slug: slugString,
  description: z.string().max(2000).optional(),
  /** Present + a real Category id → this row is a subcategory. Omitted/undefined → top-level. */
  parentId: z.string().uuid().optional(),
  sortOrder: z.number().int().min(0).default(0),
});

export const CategoryCreateSchema = CategoryFieldsSchema.openapi('CategoryCreate');
export const CategoryUpdateSchema = CategoryFieldsSchema.partial().openapi('CategoryUpdate');
export const CategoryStatusUpdateSchema = z.object({ isActive: z.boolean() }).openapi('CategoryStatusUpdate');
