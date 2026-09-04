import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';

extendZodWithOpenApi(z);

const decimalString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'must be a plain decimal amount with up to 2 places, e.g. "199.00"');

const slugString = z
  .string()
  .min(2)
  .max(160)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lower-kebab-case');

export const ProductListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(200).optional(),
  /** Superadmin oversight list only — self-service reads are always implicitly scoped to the
   *  caller's own vendor and never accept this from the query string. */
  vendorId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  subcategoryId: z.string().uuid().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const ProductFieldsSchema = z.object({
  name: z.string().min(1).max(200),
  slug: slugString,
  brand: z.string().max(150).optional(),
  categoryId: z.string().uuid(),
  subcategoryId: z.string().uuid().optional(),
  description: z.string().max(5000).optional(),
  summary: z.string().max(2000).optional(),
  benefits: z.array(z.string().max(300)).optional(),
  howToUse: z.array(z.string().max(300)).optional(),
  ingredients: z.string().max(3000).optional(),
  returnPolicy: z.string().max(2000).optional(),
  image: z.string().url().optional(),
  gallery: z.array(z.string().url()).optional(),
  imageAlt: z.string().max(300).optional(),
  badge: z.string().max(50).optional(),
  price: decimalString,
  originalPrice: decimalString.optional(),
  discount: z.number().int().min(0).max(100).optional(),
  isNew: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
});

export const ProductCreateSchema = ProductFieldsSchema.openapi('ProductCreate');
export const ProductUpdateSchema = ProductFieldsSchema.partial().openapi('ProductUpdate');
export const ProductStatusUpdateSchema = z.object({ isActive: z.boolean() }).openapi('ProductStatusUpdate');
