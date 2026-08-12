import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import type { BookingStatus } from '../generated/prisma-client';
import { getVendorByOwnerUserId } from './vendor.service';
import type { BookingCreateSchema } from '../schemas/booking.schema';

type BookingCreateInput = z.infer<typeof BookingCreateSchema>;

const BOOKING_INCLUDE = {
  deal: {
    select: {
      id: true,
      title: true,
      slug: true,
      images: true,
      service: { select: { id: true, name: true, image: true, imageAlt: true } },
    },
  },
  vendor: { select: { id: true, businessName: true } },
  branch: { select: { id: true, name: true, address: true, city: true } },
  therapist: { select: { id: true, name: true, specialization: true, photoUrl: true } },
} as const;

/** Same minimal, non-sensitive shape as order.service.ts's ORDER_INCLUDE customer select —
 *  only what a vendor/admin needs for fulfilment, never session/KYC/audit data. */
const VENDOR_BOOKING_INCLUDE = {
  ...BOOKING_INCLUDE,
  customer: { select: { id: true, name: true, phone: true, email: true } },
} as const;

export async function listMyBookings(customerId: string, opts: { page: number; pageSize: number; status?: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' }) {
  const where = { customerId, ...(opts.status ? { status: opts.status } : {}) };
  const [items, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: BOOKING_INCLUDE,
    }),
    prisma.booking.count({ where }),
  ]);
  return { items, total };
}

/** A booking belonging to a different customer 404s (not 403) — never confirms existence to
 *  someone it doesn't belong to, matching Cart's equivalent check. */
export async function getMyBookingOrThrow(customerId: string, id: string) {
  const booking = await prisma.booking.findUnique({ where: { id }, include: BOOKING_INCLUDE });
  if (!booking || booking.customerId !== customerId) throw new ApiError('NOT_FOUND', 'Booking not found');
  return booking;
}

/** Optional — "Any therapist" (input.therapistId undefined) is always valid. When provided, the
 *  therapist must exist, belong to the SAME vendor+branch the deal resolved to (never trusted
 *  from the client — mirrors how vendorId/branchId are derived from the deal above), and be
 *  active. A missing therapist 404s (matches "Deal not found" above); a therapist that exists
 *  but doesn't apply here is a VALIDATION_ERROR (matches "Only service deals can be booked" —
 *  an existing entity failing a business rule, not a missing reference). */
async function assertTherapistBookable(therapistId: string, vendorId: string, branchId: string) {
  const therapist = await prisma.therapist.findUnique({ where: { id: therapistId } });
  if (!therapist) throw new ApiError('NOT_FOUND', 'Therapist not found');
  if (therapist.vendorId !== vendorId || therapist.branchId !== branchId) {
    throw new ApiError('VALIDATION_ERROR', 'Selected therapist does not belong to this deal\'s vendor/branch');
  }
  if (!therapist.isActive) {
    throw new ApiError('VALIDATION_ERROR', 'Selected therapist is not currently available');
  }
}

export async function createBooking(customerId: string, input: BookingCreateInput) {
  const deal = await prisma.deal.findUnique({ where: { id: input.dealId } });
  if (!deal) throw new ApiError('NOT_FOUND', 'Deal not found');
  if (!deal.serviceId) throw new ApiError('VALIDATION_ERROR', 'Only service deals can be booked');
  if (input.therapistId) {
    await assertTherapistBookable(input.therapistId, deal.vendorId, deal.branchId);
  }

  return prisma.booking.create({
    data: {
      customerId,
      dealId: deal.id,
      vendorId: deal.vendorId, // derived from the Deal, never the client
      branchId: deal.branchId,
      therapistId: input.therapistId ?? null,
      bookingDate: new Date(input.bookingDate),
      timeSlot: input.timeSlot,
      quantity: input.quantity,
      // Immutable snapshot — copied once here, never re-read from Deal again.
      priceSnapshot: deal.salePrice,
      durationMinutesSnapshot: deal.durationMinutes,
    },
    include: BOOKING_INCLUDE,
  });
}

/** Customer self-cancel only — may only cancel from PENDING/CONFIRMED. Vendor/admin
 *  confirming/completing a booking (see setVendorBookingStatus below) is Phase 10. */
export async function cancelMyBooking(customerId: string, id: string, reason?: string) {
  const booking = await getMyBookingOrThrow(customerId, id);
  if (booking.status !== 'PENDING' && booking.status !== 'CONFIRMED') {
    throw new ApiError('CONFLICT', `Cannot cancel a booking with status ${booking.status}`);
  }
  return prisma.booking.update({
    where: { id },
    data: { status: 'CANCELLED', cancellationReason: reason ?? null },
    include: BOOKING_INCLUDE,
  });
}

// ─── Vendor / admin (Phase 10 — Booking lifecycle) ────────────────────────────

interface BookingListFilters {
  page: number;
  pageSize: number;
  status?: BookingStatus;
  vendorId?: string;
}

/** Same "one endpoint, ownership-aware" shape as order.service.ts's listOrders/getOrderOrThrow —
 *  a caller who owns a Vendor profile is ALWAYS force-scoped to it; only a Vendor-less caller
 *  (admin/staff) may use the optional `vendorId` filter to drill in. */
export async function listVendorBookings(callerUserId: string, opts: BookingListFilters) {
  const vendor = await getVendorByOwnerUserId(callerUserId);
  const scopedVendorId = vendor ? vendor.id : opts.vendorId;
  const where = { ...(scopedVendorId ? { vendorId: scopedVendorId } : {}), ...(opts.status ? { status: opts.status } : {}) };
  const [items, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      include: VENDOR_BOOKING_INCLUDE,
    }),
    prisma.booking.count({ where }),
  ]);
  return { items, total };
}

/** A vendor requesting another vendor's booking 404s — never confirms existence. */
export async function getVendorBookingOrThrow(callerUserId: string, id: string) {
  const vendor = await getVendorByOwnerUserId(callerUserId);
  const booking = await prisma.booking.findUnique({ where: { id }, include: VENDOR_BOOKING_INCLUDE });
  if (!booking || (vendor && booking.vendorId !== vendor.id)) throw new ApiError('NOT_FOUND', 'Booking not found');
  return booking;
}

/** Vendor/admin transitions — never back to PENDING (that's only the initial create state).
 *  A customer's self-cancel (cancelMyBooking above) already covers PENDING/CONFIRMED ->
 *  CANCELLED from their side; this is the vendor/admin-facing confirm/complete/cancel surface. */
const VENDOR_BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** Same vendor-scoping as getVendorBookingOrThrow — a vendor may only change the status of its
 *  own bookings; an admin (no Vendor profile) may change any booking's status. */
export async function setVendorBookingStatus(callerUserId: string, id: string, status: BookingStatus, reason?: string) {
  const booking = await getVendorBookingOrThrow(callerUserId, id);
  if (!VENDOR_BOOKING_TRANSITIONS[booking.status].includes(status)) {
    throw new ApiError('CONFLICT', `Cannot change status from ${booking.status} to ${status}`);
  }
  return prisma.booking.update({
    where: { id },
    data: { status, cancellationReason: status === 'CANCELLED' ? (reason ?? booking.cancellationReason) : booking.cancellationReason },
    include: VENDOR_BOOKING_INCLUDE,
  });
}
