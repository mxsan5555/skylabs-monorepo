import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const VoucherCodeParamSchema = z.object({ code: z.string().min(1).max(64) });

export const VoucherVerifySchema = z
  .object({ code: z.string().trim().min(1).max(64) })
  .strict()
  .openapi('VoucherVerify');

export const VoucherShipSchema = z
  .object({
    carrier: z.string().trim().min(1).max(200),
    trackingNumber: z.string().trim().min(1).max(200),
  })
  .strict()
  .openapi('VoucherShip');

export const VoucherDeliveryEvidenceSchema = z
  .object({ note: z.string().max(1000).optional() })
  .openapi('VoucherDeliveryEvidence');
