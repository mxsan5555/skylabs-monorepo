import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';

extendZodWithOpenApi(z);

export const CatalogDealQuerySchema = PaginationQuerySchema.extend({
  categoryId: z.string().uuid().optional(),
  subcategoryId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  /** 'service' | 'product' — which half of the catalogue to show; omitted shows both. */
  type: z.enum(['service', 'product']).optional(),
  search: z.string().max(200).optional(),
  /** 'newest' (default, unchanged behavior) orders by createdAt desc; 'discount' orders by
   *  discountPercent desc (deals with no discount sort last) — the only non-fabricated "best
   *  deals" proxy available on Deal (there is no Review/Rating model in this schema). */
  sort: z.enum(['newest', 'discount']).optional().default('newest'),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
}).openapi('CatalogDealQuery');

export const CatalogTherapistQuerySchema = PaginationQuerySchema.extend({
  vendorId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
}).openapi('CatalogTherapistQuery');
