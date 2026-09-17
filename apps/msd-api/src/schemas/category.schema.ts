import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';

extendZodWithOpenApi(z);

const slugString = z
  .string()
  .min(2)
  .max(160)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lower-kebab-case');

/** `scope=top` → parentId is null (Categories page); `scope=sub` → parentId is set but the
 *  parent is itself top-level (Sub Categories page); `scope=leaf` → parentId is set AND the
 *  parent's own parentId is set too (Category Types page — the 3rd, Type tier); omitted → every
 *  row. `parentId` further narrows `scope=sub`/`scope=leaf` to one parent. `type` filters by
 *  business module (top-level rows only carry a type — see Category's own schema doc comment);
 *  `vendorId` additionally scopes to only categories that vendor has been granted access to
 *  (every vendor-facing category dropdown once a vendor already has grants). */
export const CategoryListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(200).optional(),
  scope: z.enum(['top', 'sub', 'leaf']).optional(),
  parentId: z.string().uuid().nullable().optional(),
  type: z.enum(['SERVICE', 'PRODUCT', 'THERAPY']).optional(),
  vendorId: z.string().uuid().optional(),
});

const CategoryFieldsSchema = z.object({
  name: z.string().min(1).max(150),
  slug: slugString,
  description: z.string().max(2000).optional(),
  /** Present + a real Category id → this row is a subcategory. Omitted/undefined → top-level. */
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).default(0),
  /** Only meaningful on a top-level row (parentId omitted) — a subcategory inherits its
   *  parent's type by join, never carries its own (see Category's schema doc comment and
   *  the `Category_type_required_for_top_level` DB check constraint). */
  type: z.enum(['SERVICE', 'PRODUCT', 'THERAPY']).optional(),
  /** Drives the storefront's "Popular Category"/"Popular Therapy" carousels. */
  isPopular: z.boolean().optional(),
});

export const CategoryCreateSchema = CategoryFieldsSchema
  .refine((data) => data.parentId || data.type, {
    message: 'type is required for a top-level category',
    path: ['type'],
  })
  .openapi('CategoryCreate');
export const CategoryUpdateSchema = CategoryFieldsSchema.partial().openapi('CategoryUpdate');
export const CategoryStatusUpdateSchema = z.object({ isActive: z.boolean() }).openapi('CategoryStatusUpdate');
