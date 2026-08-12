import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
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

export async function createBooking(customerId: string, input: BookingCreateInput) {
  const deal = await prisma.deal.findUnique({ where: { id: input.dealId } });
  if (!deal) throw new ApiError('NOT_FOUND', 'Deal not found');
  if (!deal.serviceId) throw new ApiError('VALIDATION_ERROR', 'Only service deals can be booked');

  return prisma.booking.create({
    data: {
      customerId,
      dealId: deal.id,
      vendorId: deal.vendorId, // derived from the Deal, never the client
      branchId: deal.branchId,
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

/** Customer self-cancel only — may only cancel from PENDING/CONFIRMED. Vendor/admin confirming a
 *  booking (PENDING -> CONFIRMED -> COMPLETED) is a later, out-of-scope phase. */
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
