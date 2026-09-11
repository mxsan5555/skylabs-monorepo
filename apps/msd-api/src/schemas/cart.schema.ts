import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

/**
 * One unified purchase-intent line — mirrors CartItem's own "exactly one of three shapes" doc
 * comment in schema.prisma:
 *   - Service-Deal line: `dealId` + `dealPackageId` (both required together).
 *   - Product line:      `productId` only — Product is a fully independent, directly-purchasable
 *     catalog entity, never wrapped in a Deal.
 *   - Therapist line:    `therapistId` + `therapistPackageId`.
 * The refinement below enforces exactly one shape at the schema level — cart.service.ts#addItem
 * still re-validates against the live Deal/DealPackage/Therapist/TherapistPackage/Product rows
 * (this only rejects a structurally malformed request before it reaches the service).
 */
export const CartAddItemSchema = z
  .object({
    dealId: z.string().uuid().optional(),
    dealPackageId: z.string().uuid().optional(),
    therapistId: z.string().uuid().optional(),
    therapistPackageId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    quantity: z.number().int().min(1).max(99).default(1),
  })
  .refine(
    (v) => {
      const isServiceDeal = !!v.dealId && !!v.dealPackageId && !v.therapistId && !v.therapistPackageId && !v.productId;
      const isTherapist = !!v.therapistId && !!v.therapistPackageId && !v.dealId && !v.dealPackageId && !v.productId;
      const isProduct = !!v.productId && !v.dealId && !v.dealPackageId && !v.therapistId && !v.therapistPackageId;
      return isServiceDeal || isTherapist || isProduct;
    },
    {
      message:
        'Provide exactly one of: dealId + dealPackageId (a service deal), productId (a product), or therapistId + therapistPackageId — never a mix.',
    },
  )
  .openapi('CartAddItem');

export const CartUpdateItemSchema = z
  .object({
    quantity: z.number().int().min(1).max(99),
  })
  .openapi('CartUpdateItem');
