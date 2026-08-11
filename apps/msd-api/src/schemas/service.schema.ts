import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';

extendZodWithOpenApi(z);

const slugString = z
  .string()
  .min(2)
  .max(160)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lower-kebab-case');

export const ServiceListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(200).optional(),
  categoryId: z.string().uuid().optional(),
  subcategoryId: z.string().uuid().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const ServiceFieldsSchema = z.object({
  name: z.string().min(1).max(200),
  slug: slugString,
  categoryId: z.string().uuid(),
  subcategoryId: z.string().uuid().optional(),
  description: z.string().max(5000).optional(),
  image: z.string().url().optional(),
  imageAlt: z.string().max(300).optional(),
  defaultDurationMinutes: z.number().int().min(1).max(1440).optional(),
});

export const ServiceCreateSchema = ServiceFieldsSchema.openapi('ServiceCreate');
export const ServiceUpdateSchema = ServiceFieldsSchema.partial().openapi('ServiceUpdate');
export const ServiceStatusUpdateSchema = z.object({ isActive: z.boolean() }).openapi('ServiceStatusUpdate');
