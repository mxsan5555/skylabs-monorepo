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
  /** `relevance` (default): nearest first when `latitude`+`longitude` are sent, otherwise
   *  `createdAt desc` (unchanged pre-existing behavior for every caller that sends no
   *  coordinates). `price_asc`/`price_desc`: `salePrice` asc/desc, ties by `createdAt desc`.
   *  `distance`: nearest first; without coordinates behaves the same as `relevance`.
   *  `newest`/`discount`: kept for existing callers (home, explore) — unchanged. No rating sort
   *  (no review data exists in this schema). */
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'distance', 'newest', 'discount']).optional().default('relevance'),
  /** Comma-separated vendor UUIDs (max 50) → `vendorId in [...]`; wins over the single `vendorId`
   *  above when both are given. */
  vendorIds: z.string().regex(/^[0-9a-f-]{36}(,[0-9a-f-]{36}){0,49}$/i).optional(),
  /** Comma-separated branch UUIDs (max 50) → `branchId in [...]`; wins over the single `branchId`
   *  above when both are given. */
  branchIds: z.string().regex(/^[0-9a-f-]{36}(,[0-9a-f-]{36}){0,49}$/i).optional(),
  /** Radius in km around `latitude`/`longitude`; ignored without coordinates. */
  radiusKm: z.coerce.number().gt(0).max(500).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  /** The customer's own browser-geolocation coordinates (see `useCurrentLocation`) — when both
   *  are present, results are re-sorted nearest-first by real distance to each result's own
   *  branch coordinates (see `listPublicDeals`'s own doc comment); omitted → unchanged behavior.
   *  Never persisted — used only for this request's own distance calc. */
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
}).openapi('CatalogDealQuery');

/** Comma-separated UUID list (`vendorIds`/`branchIds`) → a plain string array, or `undefined`
 *  when the query param was omitted. */
export const splitIds = (value?: string) => (value ? value.split(',').filter(Boolean) : undefined);

/** `GET /catalog/deals/facets` — every base/facet filter `CatalogDealQuerySchema` accepts, minus
 *  paging and sort (facets counts, never paginates or sorts a list). */
export const CatalogDealFacetQuerySchema = CatalogDealQuerySchema.omit({ page: true, pageSize: true, sort: true }).openapi('CatalogDealFacetQuery');

/** `GET /catalog/products` — mirrors CatalogDealQuerySchema minus the branch/location/duration
 *  concepts Product doesn't have (no branchId, no packages, no geo distance sort). */
export const CatalogProductQuerySchema = PaginationQuerySchema.extend({
  categoryId: z.string().uuid().optional(),
  subcategoryId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  /** 'relevance' (default) orders by createdAt desc, same as 'newest' (kept for existing
   *  callers). 'price_asc'/'price_desc' order by Product.price asc/desc, ties by createdAt desc.
   *  'discount' orders by Product.discount desc (deals with no discount sort last) — the only
   *  non-fabricated "best deals" proxy available on Product (no Review/Rating model exists). */
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'newest', 'discount']).optional().default('relevance'),
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
