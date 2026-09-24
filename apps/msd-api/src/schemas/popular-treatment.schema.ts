import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';

extendZodWithOpenApi(z);

const slugString = z
  .string()
  .min(2)
  .max(160)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lower-kebab-case');

export const PopularTreatmentGroupListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(200).optional(),
});

const PopularTreatmentGroupFieldsSchema = z.object({
  name: z.string().min(1).max(100),
  slug: slugString,
  sortOrder: z.number().int().min(0).optional(),
});

export const PopularTreatmentGroupCreateSchema = PopularTreatmentGroupFieldsSchema.openapi('PopularTreatmentGroupCreate');
export const PopularTreatmentGroupUpdateSchema = PopularTreatmentGroupFieldsSchema.partial().openapi('PopularTreatmentGroupUpdate');
export const PopularTreatmentGroupStatusUpdateSchema = z.object({ isActive: z.boolean() }).openapi('PopularTreatmentGroupStatusUpdate');

export const PopularTreatmentListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(200).optional(),
  groupId: z.string().uuid().optional(),
});

const PopularTreatmentFieldsSchema = z.object({
  name: z.string().min(1).max(100),
  slug: slugString,
  groupId: z.string().uuid(),
  categoryId: z.string().uuid().optional().nullable(),
  subcategoryId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});

export const PopularTreatmentCreateSchema = PopularTreatmentFieldsSchema.openapi('PopularTreatmentCreate');
export const PopularTreatmentUpdateSchema = PopularTreatmentFieldsSchema.partial().openapi('PopularTreatmentUpdate');
export const PopularTreatmentStatusUpdateSchema = z.object({ isActive: z.boolean() }).openapi('PopularTreatmentStatusUpdate');
