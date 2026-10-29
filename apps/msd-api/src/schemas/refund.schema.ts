import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

/**
 * Admin-only. `entitlementId` is required whenever the targeted `OrderItem` has more than one
 * `PurchaseEntitlement` (a multi-quantity SERVICE line) so a refund never ambiguously applies to
 * "the item" when it actually has several independent vouchers — see refund.service.ts#createRefund.
 * `disputeId` links the refund back to the dispute it resolves, if any (a direct admin refund with
 * no prior dispute is also valid — e.g. a goodwill gesture).
 */
export const RefundCreateSchema = z
  .object({
    orderItemId: z.string().uuid(),
    entitlementId: z.string().uuid().optional(),
    amount: z.coerce.number().positive(),
    type: z.enum(['FULL', 'PARTIAL']),
    reason: z.string().trim().max(1000).optional(),
    disputeId: z.string().uuid().optional(),
  })
  .openapi('RefundCreate');
