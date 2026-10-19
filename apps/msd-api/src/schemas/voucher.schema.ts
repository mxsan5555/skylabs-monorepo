import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';

extendZodWithOpenApi(z);

export const VoucherCodeParamSchema = z.object({ code: z.string().min(1).max(64) });

/** Query for the Service Queue list (`GET /vouchers/queue`) — same `search` shape as
 *  `CrossVendorListQuerySchema` in vendor.schema.ts. */
export const VoucherQueueQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(200).optional(),
});

export const VoucherVerifySchema = z
  .object({ code: z.string().trim().min(1).max(64) })
  .openapi('VoucherVerify');

/** `purpose` is inferred server-side from the entitlement's own `fulfilmentKind` — never trusted
 *  from the request body (a caller could otherwise request a SERVICE_COMPLETION OTP for a product
 *  pickup voucher or vice versa). Body is empty on purpose; kept as a named schema for OpenAPI
 *  symmetry with the other voucher actions and in case a future resend-reason field is added. */
export const VoucherOtpRequestSchema = z.object({}).openapi('VoucherOtpRequest');

export const VoucherCompleteSchema = z
  .object({ otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits') })
  .openapi('VoucherComplete');

export const VoucherShipSchema = z
  .object({
    carrier: z.string().trim().min(1).max(200),
    trackingNumber: z.string().trim().min(1).max(200),
  })
  .openapi('VoucherShip');

export const VoucherDeliveryEvidenceSchema = z
  .object({ note: z.string().max(1000).optional() })
  .openapi('VoucherDeliveryEvidence');
