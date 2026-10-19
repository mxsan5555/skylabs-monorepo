import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';

extendZodWithOpenApi(z);

/**
 * Internal-route allow-list for `destinationType: 'ROUTE'` — a fixed, hand-maintained list of
 * safe, known public routes (mirrors the login-redirect flow's `sanitizeReturnUrl` discipline:
 * never accept an arbitrary caller-supplied path, only ever a route this app actually serves).
 * Extend this list when a new public route becomes a valid promotion destination.
 */
export const PROMOTION_ROUTE_ALLOW_LIST = [
  '/',
  '/explore',
  '/categories',
  '/products',
  '/therapists',
  '/become-member',
  '/how-it-works',
] as const;

export const PromotionListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(200).optional(),
});

const PromotionFieldsSchema = z
  .object({
    title: z.string().min(1).max(150),
    description: z.string().max(2000).optional().nullable(),
    buttonLabel: z.string().max(60).optional().nullable(),
    destinationType: z.enum(['ROUTE', 'CATEGORY', 'DEAL']),
    destinationRoute: z.enum(PROMOTION_ROUTE_ALLOW_LIST).optional().nullable(),
    categoryId: z.string().uuid().optional().nullable(),
    dealId: z.string().uuid().optional().nullable(),
    sortOrder: z.number().int().min(0).optional(),
    startDate: z.coerce.date().optional().nullable(),
    endDate: z.coerce.date().optional().nullable(),
  })
  .refine((data) => data.destinationType !== 'ROUTE' || Boolean(data.destinationRoute), {
    message: 'destinationRoute is required when destinationType is ROUTE',
    path: ['destinationRoute'],
  })
  .refine((data) => data.destinationType !== 'CATEGORY' || Boolean(data.categoryId), {
    message: 'categoryId is required when destinationType is CATEGORY',
    path: ['categoryId'],
  })
  .refine((data) => data.destinationType !== 'DEAL' || Boolean(data.dealId), {
    message: 'dealId is required when destinationType is DEAL',
    path: ['dealId'],
  })
  .refine((data) => !data.startDate || !data.endDate || data.startDate <= data.endDate, {
    message: 'startDate must be on or before endDate',
    path: ['endDate'],
  });

export const PromotionCreateSchema = PromotionFieldsSchema.openapi('PromotionCreate');
// `.partial()` isn't available directly on a `ZodEffects` (the `.refine()` chain above) — an
// update re-validates the same cross-field rules against the MERGED (existing + patch) record in
// the service layer instead (see `promotion.service.ts#updatePromotion`), so this only needs to
// validate each field's own shape here, individually optional.
export const PromotionUpdateSchema = z
  .object({
    title: z.string().min(1).max(150).optional(),
    description: z.string().max(2000).optional().nullable(),
    buttonLabel: z.string().max(60).optional().nullable(),
    destinationType: z.enum(['ROUTE', 'CATEGORY', 'DEAL']).optional(),
    destinationRoute: z.enum(PROMOTION_ROUTE_ALLOW_LIST).optional().nullable(),
    categoryId: z.string().uuid().optional().nullable(),
    dealId: z.string().uuid().optional().nullable(),
    sortOrder: z.number().int().min(0).optional(),
    startDate: z.coerce.date().optional().nullable(),
    endDate: z.coerce.date().optional().nullable(),
  })
  .openapi('PromotionUpdate');
export const PromotionStatusUpdateSchema = z.object({ isActive: z.boolean() }).openapi('PromotionStatusUpdate');
