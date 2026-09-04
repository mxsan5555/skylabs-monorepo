import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const WishlistAddItemSchema = z
  .object({
    dealId: z.string().uuid(),
  })
  .openapi('WishlistAddItem');

/** `:dealId` route param — Wishlist is keyed by (customerId, dealId), not a WishlistItem id, so
 *  DELETE/check operate directly on the deal the caller means, mirroring how Cart's `cartId_dealId`
 *  compound key works internally (just surfaced at the route level here instead of an item id). */
export const WishlistDealParamSchema = z.object({
  dealId: z.string().uuid(),
});
