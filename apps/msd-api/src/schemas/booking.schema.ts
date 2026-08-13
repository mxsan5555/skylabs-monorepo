import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';

extendZodWithOpenApi(z);

export const BookingListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED']).optional(),
  /** Admin-only drill-in filter — ignored for a caller who owns a Vendor profile, whose results
   *  are always force-scoped to their own vendorId (matches OrderListQuerySchema's vendorId). */
  vendorId: z.string().uuid().optional(),
});

export const BookingCreateSchema = z
  .object({
    dealId: z.string().uuid(),
    bookingDate: z.string().datetime(),
    timeSlot: z.string().min(1).max(50),
    quantity: z.number().int().min(1).max(20).default(1),
    /** Optional — "Any therapist" remains a valid choice when omitted. Must belong to the same
     *  vendor+branch as the deal and be active; enforced in booking.service.ts, never trusted
     *  from the client (see createBooking). */
    therapistId: z.string().uuid().optional(),
  })
  .openapi('BookingCreate');

/** Customer self-service may only ever cancel — confirming/completing a booking is the
 *  vendor/admin-facing surface below (BookingVendorStatusUpdateSchema, Phase 10). */
export const BookingCancelSchema = z
  .object({
    status: z.literal('CANCELLED'),
    cancellationReason: z.string().max(500).optional(),
  })
  .openapi('BookingCancel');

/** Vendor/admin transitions — never back to PENDING (see setVendorBookingStatus). */
export const BookingVendorStatusUpdateSchema = z
  .object({
    status: z.enum(['CONFIRMED', 'COMPLETED', 'CANCELLED']),
    cancellationReason: z.string().max(500).optional(),
  })
  .openapi('BookingVendorStatusUpdate');
