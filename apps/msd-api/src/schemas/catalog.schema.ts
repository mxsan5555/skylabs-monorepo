import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';

extendZodWithOpenApi(z);

export const CatalogDealQuerySchema = PaginationQuerySchema.extend({
  categoryId: z.string().uuid().optional(),
  subcategoryId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
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
  /** The customer's own browser-geolocation coordinates (see `useCurrentLocation`) — when both
   *  are present, results are re-sorted nearest-first by real distance to each result's own
   *  branch coordinates (see `listPublicDeals`'s own doc comment); omitted → unchanged behavior.
   *  Never persisted — used only for this request's own distance calc. */
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
}).openapi('CatalogDealQuery');

/** `GET /catalog/products` — mirrors CatalogDealQuerySchema minus the branch/location/duration
 *  concepts Product doesn't have (no branchId, no packages, no geo distance sort). */
export const CatalogProductQuerySchema = PaginationQuerySchema.extend({
  categoryId: z.string().uuid().optional(),
  subcategoryId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  /** See `CatalogDealQuerySchema`'s identical param doc comment — 'discount' orders by
   *  Product.discount desc instead of Deal.discountPercent. */
  sort: z.enum(['newest', 'discount']).optional().default('newest'),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
}).openapi('CatalogProductQuery');

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
  /** See `CatalogDealQuerySchema`'s identical param doc comment. */
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
}).openapi('CatalogTherapistQuery');

/** `GET /catalog/vendors/:slug` — narrows the nested active-branches list, same state/city
 *  semantics as CatalogDealQuerySchema above. */
export const CatalogVendorQuerySchema = z
  .object({
    state: z.string().max(100).optional(),
    city: z.string().max(100).optional(),
  })
  .openapi('CatalogVendorQuery');
