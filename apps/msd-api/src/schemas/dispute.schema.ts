import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';

extendZodWithOpenApi(z);

/** Customer-raised — scoped to ONE entitlement (one voucher/unit), never the whole order or
 *  vendor (see PurchaseDispute's own schema doc comment). Ownership (the entitlement must belong
 *  to the caller) is checked in dispute.service.ts, never trusted from this body. */
export const DisputeCreateSchema = z
  .object({
    entitlementId: z.string().uuid(),
    reason: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    evidenceStorageKey: z.string().max(500).optional(),
  })
  .openapi('DisputeCreate');

export const DisputeListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(['OPEN', 'UNDER_REVIEW', 'RESOLVED']).optional(),
  vendorId: z.string().uuid().optional(),
});

export const DisputeStatusUpdateSchema = z
  .object({ status: z.enum(['UNDER_REVIEW']) })
  .openapi('DisputeStatusUpdate');

/**
 * `resolutionType: REFUNDED` means "the customer's claim is upheld" — the actual refund is a
 * separate `POST /refunds` call (admin-only, possibly referencing this dispute's id); resolving
 * here only records the decision and, for NO_ACTION/OTHER, restores the entitlement's
 * `settlementStatus` from `preDisputeStatus` (un-blocking it). `NO_ACTION`/`OTHER` require the
 * `reject` permission (the claim was reviewed and not upheld); `REFUNDED` requires `approve`
 * (the claim was reviewed and upheld) — see disputes.routes.ts.
 */
export const DisputeResolveSchema = z
  .object({
    resolutionType: z.enum(['NO_ACTION', 'REFUNDED', 'OTHER']),
    resolutionNotes: z.string().trim().max(2000).optional(),
  })
  .openapi('DisputeResolve');
