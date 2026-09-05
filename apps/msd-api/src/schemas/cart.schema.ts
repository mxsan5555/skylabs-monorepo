import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

/**
 * One unified purchase-intent line — mirrors CartItem's own "exactly one of three shapes" doc
 * comment in schema.prisma:
 *   - Product line:      `dealId` only.
 *   - Service-Deal line: `dealId` + `dealPackageId`.
 *   - Therapist line:    `therapistId` + `therapistPackageId`.
 * The refinement below enforces exactly one shape at the schema level — cart.service.ts#addItem
 * still re-validates against the live Deal/DealPackage/Therapist/TherapistPackage rows (this only
 * rejects a structurally malformed request before it reaches the service).
 */
export const CartAddItemSchema = z
  .object({
    dealId: z.string().uuid().optional(),
    dealPackageId: z.string().uuid().optional(),
    therapistId: z.string().uuid().optional(),
    therapistPackageId: z.string().uuid().optional(),
    quantity: z.number().int().min(1).max(99).default(1),
  })
  .refine(
    (v) => {
      const isProductOrServiceDeal = !!v.dealId && !v.therapistId && !v.therapistPackageId;
      const isTherapist = !!v.therapistId && !!v.therapistPackageId && !v.dealId && !v.dealPackageId;
      return isProductOrServiceDeal || isTherapist;
    },
    {
      message:
        'Provide either dealId (optionally with dealPackageId for a service deal), or therapistId + therapistPackageId — never a mix.',
    },
  )
  .openapi('CartAddItem');

export const CartUpdateItemSchema = z
  .object({
    quantity: z.number().int().min(1).max(99),
  })
  .openapi('CartUpdateItem');
