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
  /** Narrows to deals whose branch is in this state/city — merges into the existing active-
   *  branch filter, never overwrites it (see listPublicDeals's own doc comment). */
  state: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  /** 'newest' (default, unchanged behavior) orders by createdAt desc; 'discount' orders by
   *  discountPercent desc (deals with no discount sort last) — the only non-fabricated "best
   *  deals" proxy available on Deal (there is no Review/Rating model in this schema). */
  sort: z.enum(['newest', 'discount']).optional().default('newest'),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
}).openapi('CatalogDealQuery');

export const CatalogTherapistQuerySchema = PaginationQuerySchema.extend({
  /** Top-level THERAPY Category id — matches therapists whose `specializationCategoryId` is
   *  this category itself OR one of its direct subcategories (see `listPublicTherapists`'s own
   *  doc comment). Ignored when `subcategoryId` is also given. */
  categoryId: z.string().uuid().optional(),
  /** Exact `specializationCategoryId` match — wins over `categoryId` when both are given. */
  subcategoryId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
}).openapi('CatalogTherapistQuery');

/** `GET /catalog/vendors/:slug` — narrows the nested active-branches list, same state/city
 *  semantics as CatalogDealQuerySchema above. */
export const CatalogVendorQuerySchema = z
  .object({
    state: z.string().max(100).optional(),
    city: z.string().max(100).optional(),
  })
  .openapi('CatalogVendorQuery');
