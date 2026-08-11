import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const CartAddItemSchema = z
  .object({
    dealId: z.string().uuid(),
    quantity: z.number().int().min(1).max(99).default(1),
  })
  .openapi('CartAddItem');

export const CartUpdateItemSchema = z
  .object({
    quantity: z.number().int().min(1).max(99),
  })
  .openapi('CartUpdateItem');
