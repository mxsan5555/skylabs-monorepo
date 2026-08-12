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
}).openapi('CatalogDealQuery');
