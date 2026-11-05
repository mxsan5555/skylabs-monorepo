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

export const BANNER_SLOTS = ['HOME_AFTER_DEALS', 'HOME_AFTER_PRODUCTS', 'CATEGORY_TOP', 'EXPLORE_TOP', 'DEAL_BOTTOM', 'PRODUCT_BOTTOM'] as const;
export const BANNER_COLOR_ROLES = ['PRIMARY', 'SECONDARY', 'TERTIARY', 'SURFACE', 'SURFACE_HIGH', 'INVERSE'] as const;
/** Buttons take a strong fill only, so the button keeps 3:1 against any banner background. */
export const BANNER_BUTTON_ROLES = ['PRIMARY', 'SECONDARY', 'TERTIARY', 'INVERSE'] as const;
const DESTINATION_TYPES = ['ROUTE', 'CATEGORY', 'DEAL', 'PRODUCT'] as const;

/** `state` omitted = every banner, `__global__` = Global/Default only, a name = that state. */
export const PromotionListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(200).optional(),
  state: z.string().max(100).optional(),
});

const bannerFields = {
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300).optional().nullable(),
  buttonLabel: z.string().trim().min(1).max(40),
  state: z.string().trim().min(1).max(100).optional().nullable(),
  backgroundRole: z.enum(BANNER_COLOR_ROLES),
  buttonRole: z.enum(BANNER_BUTTON_ROLES),
  placements: z.array(z.enum(BANNER_SLOTS)).min(1).max(BANNER_SLOTS.length),
  destinationType: z.enum(DESTINATION_TYPES),
  destinationRoute: z.enum(PROMOTION_ROUTE_ALLOW_LIST).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  dealId: z.string().uuid().optional().nullable(),
  productId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
};

/** The field each destination type needs. */
const DESTINATION_FIELD = {
  ROUTE: 'destinationRoute',
  CATEGORY: 'categoryId',
  DEAL: 'dealId',
  PRODUCT: 'productId',
} as const;

export const PromotionCreateSchema = z
  .object(bannerFields)
  .strict()
  .superRefine((data, ctx) => {
    const field = DESTINATION_FIELD[data.destinationType];
    if (!data[field]) {
      ctx.addIssue({ code: 'custom', message: `${field} is required when destinationType is ${data.destinationType}`, path: [field] });
    }
    if (data.startDate && data.endDate && data.startDate > data.endDate) {
      ctx.addIssue({ code: 'custom', message: 'startDate must be on or before endDate', path: ['endDate'] });
    }
  })
  .openapi('PromotionCreate');

/** Every field optional; the service re-checks the destination rules against the merged record. */
export const PromotionUpdateSchema = z.object(bannerFields).partial().strict().openapi('PromotionUpdate');
export const PromotionStatusUpdateSchema = z.object({ isActive: z.boolean() }).openapi('PromotionStatusUpdate');

/** Public `GET /catalog/banners`. */
export const PublicBannerQuerySchema = z
  .object({
    slot: z.enum(BANNER_SLOTS),
    state: z.string().max(100).optional(),
  })
  .strict();
