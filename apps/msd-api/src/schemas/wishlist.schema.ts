import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const WishlistAddItemSchema = z
  .object({
    dealId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
  })
  .refine(
    (data) =>
      (data.dealId !== undefined) !==
      (data.productId !== undefined),
    {
      message: 'Provide either dealId or productId',
    },
  )
  .openapi('WishlistAddItem');

export const WishlistDealParamSchema = z.object({
  dealId: z.string().uuid(),
});

export const WishlistProductParamSchema = z.object({
  productId: z.string().uuid(),
});