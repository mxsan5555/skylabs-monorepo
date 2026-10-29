import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';

extendZodWithOpenApi(z);

/** Super-Admin-managed commission + hold-period + completion-OTP config — reuses the existing
 *  `system-settings` menu/permission (no new menu node, see msd-menu.json). Every field optional
 *  on the PATCH body — a partial update leaves the rest of the singleton row untouched. */
export const FinanceSettingsUpdateSchema = z
  .object({
    defaultCommissionRatePercent: z.coerce.number().min(0).max(100).optional(),
    serviceHoldHours: z.coerce.number().int().min(0).optional(),
    productReturnHoldHours: z.coerce.number().int().min(0).optional(),
    completionOtpExpiryMinutes: z.coerce.number().int().min(1).optional(),
    completionOtpMaxAttempts: z.coerce.number().int().min(1).optional(),
    completionOtpResendCooldownSeconds: z.coerce.number().int().min(0).optional(),
  })
  .openapi('FinanceSettingsUpdate');

/** Per-vendor commission override — `null` clears the override back to the global default. */
export const VendorCommissionRateUpdateSchema = z
  .object({
    commissionRatePercent: z.coerce.number().min(0).max(100).nullable(),
  })
  .openapi('VendorCommissionRateUpdate');

export const CustomerPaymentsQuerySchema = PaginationQuerySchema.extend({
  vendorId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
});

export const MemberSettlementsQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(200).optional(),
  /** Deep-link filter for the Accounts Overview "Ready for Payout" strip's "Review Payouts"
   *  link — narrows the list to vendors with `readyForPayout > 0` (a derived aggregate, computed
   *  server-side; never a stored column). Omitted = unfiltered, today's behavior unchanged. */
  status: z.enum(['ready']).optional(),
});

export const VendorIdParamSchema = z.object({ vendorId: z.string().uuid() });

/**
 * Records an already-completed manual bank transfer. `idempotencyKey` should be a stable value
 * generated once by the caller (e.g. when the "Record Bank Payment" dialog opens) and resent
 * unchanged on any retry — a repeat submission with the same key returns the original payout
 * instead of creating a second one or double-allocating any entitlement (the real guarantee is
 * `MemberPayoutItem.entitlementId`'s DB-level `@unique`, this is the request-level idempotency
 * guard on top of it). Falls back to a server-generated key when omitted (still safe against
 * double-allocation, just without true duplicate-submit protection).
 */
export const RecordPayoutSchema = z
  .object({
    entitlementIds: z.array(z.string().uuid()).min(1),
    reference: z.string().max(200).optional(),
    transferDate: z.string().datetime().optional(),
    proofStorageKey: z.string().max(500).optional(),
    idempotencyKey: z.string().min(1).max(200).optional(),
  })
  .openapi('RecordPayout');
