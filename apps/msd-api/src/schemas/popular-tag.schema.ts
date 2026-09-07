import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';

extendZodWithOpenApi(z);

const slugString = z
  .string()
  .min(2)
  .max(160)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lower-kebab-case');

export const PopularTagListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(200).optional(),
});

const PopularTagFieldsSchema = z.object({
  name: z.string().min(1).max(100),
  slug: slugString,
});

export const PopularTagCreateSchema = PopularTagFieldsSchema.openapi('PopularTagCreate');
export const PopularTagUpdateSchema = PopularTagFieldsSchema.partial().openapi('PopularTagUpdate');
export const PopularTagStatusUpdateSchema = z.object({ isActive: z.boolean() }).openapi('PopularTagStatusUpdate');

/** One mapping request — `targetType` dispatches to the matching join table
 *  (`PopularTagCategory`/`PopularTagDeal`/`PopularTagProduct`/`PopularTagTherapist`), mirroring
 *  this schema's own established convention of one real join table per target entity rather than
 *  a generic polymorphic `entityType`/`entityId` column (see `PopularTag`'s schema doc comment). */
export const PopularTagMapSchema = z
  .object({
    targetType: z.enum(['category', 'deal', 'product', 'therapist']),
    targetId: z.string().uuid(),
  })
  .openapi('PopularTagMap');

export const PopularTagMappingParamsSchema = z.object({
  id: z.string().uuid(),
  targetType: z.enum(['category', 'deal', 'product', 'therapist']),
  targetId: z.string().uuid(),
});
