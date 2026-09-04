import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Date-only, no time component — the report request explicitly asked for this ("Do NOT
 *  introduce unnecessary time selection"). Expanded to a full UTC day range in
 *  reports.service.ts's `dateRangeWhere`. */
export const ReportFiltersQuerySchema = z.object({
  dateFrom: z.string().regex(DATE_ONLY_REGEX, 'must be YYYY-MM-DD').optional(),
  dateTo: z.string().regex(DATE_ONLY_REGEX, 'must be YYYY-MM-DD').optional(),
  vendorId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  orderStatus: z.enum(['PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'CANCELLED']).optional(),
  paymentStatus: z.enum(['CREATED', 'PAID', 'FAILED', 'CANCELLED']).optional(),
});

export const TopListQuerySchema = ReportFiltersQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const TopVendorsQuerySchema = TopListQuerySchema.extend({
  by: z.enum(['revenue', 'orders']).default('revenue'),
});
