import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';

extendZodWithOpenApi(z);

export const OrderFromBookingSchema = z
  .object({ bookingId: z.string().uuid() })
  .openapi('OrderFromBooking');

/** Customer self-service may only ever cancel — confirm/complete is admin-only (existing
 *  `orders:status_change`), matching Booking's equivalent split. */
export const OrderCustomerCancelSchema = z
  .object({
    status: z.literal('CANCELLED'),
    cancellationReason: z.string().max(500).optional(),
  })
  .openapi('OrderCustomerCancel');

export const OrderStatusUpdateSchema = z
  .object({
    status: z.enum(['PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'CANCELLED']),
    cancellationReason: z.string().max(500).optional(),
  })
  .openapi('OrderStatusUpdate');

export const OrderListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(['PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'CANCELLED']).optional(),
  /** Admin-only drill-in filter — ignored for a caller who owns a Vendor profile, whose results
   *  are always force-scoped to their own vendorId regardless of this param. */
  vendorId: z.string().uuid().optional(),
  /** A vendor may narrow to one of its own branches; admin may filter any branch. */
  branchId: z.string().uuid().optional(),
  /** Matches orders with at least one payment attempt in this state — Order has no single
   *  "payment status" column of its own (Order 1 -> Payment[], see the Phase 9 architecture
   *  plan), so this is necessarily "has a payment attempt with this status", not "the current
   *  payment status" (which the Order.status itself already encodes for the confirmed/paid case). */
  paymentStatus: z.enum(['CREATED', 'PAID', 'FAILED', 'CANCELLED']).optional(),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
  /** Free-text search across customer name, vendor/branch name snapshot, and item names. */
  search: z.string().max(200).optional(),
});
