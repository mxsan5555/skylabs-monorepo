import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';

extendZodWithOpenApi(z);

export const BookingListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED']).optional(),
  /** Admin-only drill-in filter — ignored for a caller who owns a Vendor profile, whose results
   *  are always force-scoped to their own vendorId (matches OrderListQuerySchema's vendorId). */
  vendorId: z.string().uuid().optional(),
  /** Admin-only drill-in filter (Customer Detail's Bookings tab) — same rule as `vendorId`. */
  customerId: z.string().uuid().optional(),
});

export const BookingCreateSchema = z
  .object({
    /** Optional — absent for a Therapist booked directly (no Deal involved at all); see
     *  Booking's own "exactly one of dealId/therapistId" doc comment. Exactly one of
     *  dealId/therapistId is required (enforced by the refinements below). */
    dealId: z.string().uuid().optional(),
    /** Optional — this is a service purchase, not an appointment-scheduling system; the
     *  customer is never required to pick a date/time to complete a booking (see Booking's own
     *  schema doc comment). When provided, both must be provided together. */
    bookingDate: z.string().datetime().optional(),
    timeSlot: z.string().min(1).max(50).optional(),
    quantity: z.number().int().min(1).max(20).default(1),
    /** When `dealId` is set: optional — "Any therapist" remains a valid choice when omitted
     *  (unless the deal has active therapist packages, in which case booking.service.ts requires
     *  one). Must belong to the same vendor+branch as the deal and be active. When `dealId` is
     *  absent: REQUIRED — this is a direct Therapist booking, with no Deal involved at all.
     *  Never trusted from the client beyond identifying the row — enforced in booking.service.ts. */
    therapistId: z.string().uuid().optional(),
    /** Required when `dealId` is absent (direct Therapist booking) — selects which of the
     *  Therapist's packages to book, matched purely by this number (see resolveBookingPrice).
     *  Ignored when `dealId` is present, since the selected DealPackage's own durationMinutes
     *  governs instead (see `dealPackageId` below). */
    durationMinutes: z.number().int().min(1).max(1000).optional(),
    /** Required when `dealId` is set AND the deal has active packages (the normal case for
     *  every service deal — see DealPackage's own schema doc comment) — the customer always
     *  books a specific duration/price package, never the Deal's own price directly. Never
     *  trusted from the client beyond identifying the row — enforced in booking.service.ts. */
    dealPackageId: z.string().uuid().optional(),
  })
  .refine((data) => (data.bookingDate == null) === (data.timeSlot == null), {
    message: 'bookingDate and timeSlot must be provided together, or both omitted',
    path: ['timeSlot'],
  })
  .refine((data) => data.dealId != null || data.therapistId != null, {
    message: 'Either dealId or therapistId is required',
    path: ['dealId'],
  })
  .refine((data) => data.dealId != null || data.durationMinutes != null, {
    message: 'durationMinutes is required when booking a therapist directly (no dealId)',
    path: ['durationMinutes'],
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
