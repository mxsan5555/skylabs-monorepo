import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma, type BookingStatus } from '../generated/prisma-client';
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
  therapist: { select: { id: true, therapistType: true, personName: true, specialization: true, photoUrl: true } },
  dealPackage: { select: { id: true, durationMinutes: true, sellingPrice: true } },
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

/**
 * Resolves the price this booking must charge. Therapist selection is always optional — Deal
 * and Therapist are independently managed (see TherapistPackage's schema doc comment), never
 * coupled through any shared id, so there is no "this Deal requires a therapist" concept
 * anymore. When no therapist is selected, the selected DealPackage's own price applies (see
 * `resolveDealPrice` below — never Deal.salePrice directly for a deal with packages, see
 * DealPackage's schema doc comment). When a therapist IS selected, their own package must exist
 * for THIS EXACT duration (`selectedDurationMinutes` — the customer's actually-selected
 * DealPackage duration, never Deal's own possibly-stale "from price" durationMinutes) — matched
 * purely by that number, never by any id — and its price overrides the Deal package's; if the
 * selected therapist has no active package at that duration, that's an invalid combination and
 * the booking is rejected rather than silently falling back.
 */
async function resolveBookingPrice(
  selectedDurationMinutes: number | null,
  therapistId: string | undefined,
  dealPrice: Prisma.Decimal,
) {
  if (!therapistId) {
    return { priceSnapshot: dealPrice, therapistPackageId: null as string | null };
  }
  const pkg = selectedDurationMinutes == null
    ? null
    : await prisma.therapistPackage.findFirst({
        where: { therapistId, durationMinutes: selectedDurationMinutes, isActive: true },
      });
  if (!pkg) {
    throw new ApiError('VALIDATION_ERROR', 'Selected therapist does not offer a package for this duration.');
  }
  return { priceSnapshot: pkg.sellingPrice, therapistPackageId: pkg.id };
}

/**
 * Resolves which DealPackage (if any) prices this booking — REQUIRED when the deal has any
 * active packages (the normal case for every service deal created after DealPackage existed;
 * see DealPackage's own schema doc comment), never trusted from the client beyond identifying
 * the row. Falls back to the Deal's own salePrice/durationMinutes only for the safety-net case
 * of a service deal with zero active packages (pre-migration leftovers, if any).
 */
async function resolveDealPrice(deal: { id: string; salePrice: Prisma.Decimal; durationMinutes: number | null }, dealPackageId: string | undefined) {
  const activePackageCount = await prisma.dealPackage.count({ where: { dealId: deal.id, isActive: true } });
  if (activePackageCount === 0) {
    return { dealPrice: deal.salePrice, selectedDurationMinutes: deal.durationMinutes, dealPackageId: null as string | null };
  }
  if (!dealPackageId) {
    throw new ApiError('VALIDATION_ERROR', 'Select a package (duration) for this deal.');
  }
  const pkg = await prisma.dealPackage.findUnique({ where: { id: dealPackageId } });
  if (!pkg || pkg.dealId !== deal.id) throw new ApiError('NOT_FOUND', 'Deal package not found');
  if (!pkg.isActive) throw new ApiError('VALIDATION_ERROR', 'Selected package is not currently available');
  return { dealPrice: pkg.sellingPrice, selectedDurationMinutes: pkg.durationMinutes, dealPackageId: pkg.id };
}

/** Non-terminal statuses — a booking still "in play" per BookingStatus's lifecycle
 *  (PENDING/CONFIRMED -> COMPLETED/CANCELLED). Shared by the duplicate-booking guard below. */
const ACTIVE_BOOKING_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED'];

export async function createBooking(customerId: string, input: BookingCreateInput) {
  if (input.dealId) {
    return createBookingFromDeal(customerId, input.dealId, input);
  }
  // BookingCreateSchema's refinements guarantee therapistId+durationMinutes are set when dealId
  // is absent — this is a Therapist booked directly, with no Deal involved at all.
  return createBookingFromTherapist(customerId, input.therapistId!, input.durationMinutes!, input);
}

async function createBookingFromDeal(customerId: string, dealId: string, input: BookingCreateInput) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new ApiError('NOT_FOUND', 'Deal not found');
  if (!deal.serviceId) throw new ApiError('VALIDATION_ERROR', 'Only service deals can be booked');
  if (input.therapistId) {
    await assertTherapistBookable(input.therapistId, deal.vendorId, deal.branchId);
  }
  // Never trusts a client-supplied price — resolves the real, current price server-side from the
  // customer's selected DealPackage (required whenever the deal has active packages — see
  // resolveDealPrice), then, when a therapist is also selected, their own package price for
  // that exact selected duration overrides it.
  const { dealPrice, selectedDurationMinutes, dealPackageId } = await resolveDealPrice(deal, input.dealPackageId);
  const { priceSnapshot, therapistPackageId } = await resolveBookingPrice(selectedDurationMinutes, input.therapistId, dealPrice);

  // Same customer + same deal + same selected package + still-active booking already exists —
  // block a second one until the first reaches a terminal status (COMPLETED/CANCELLED). Keyed by
  // dealPackageId too (same discipline as createBookingFromTherapist's own dedupe guard below) —
  // booking two DIFFERENT packages of the same Deal (e.g. 30min once, 60min another time) is a
  // legitimate distinct purchase, not a duplicate. Scoped to `customerId` so the 409's `details`
  // can never reveal another customer's booking.
  const existingActive = await prisma.booking.findFirst({
    where: { customerId, dealId: deal.id, dealPackageId, status: { in: ACTIVE_BOOKING_STATUSES } },
  });
  if (existingActive) {
    throw new ApiError('CONFLICT', 'Already booked. Your existing booking is still active.', {
      bookingId: existingActive.id,
    });
  }

  return prisma.booking.create({
    data: {
      customerId,
      dealId: deal.id,
      vendorId: deal.vendorId, // derived from the Deal, never the client
      branchId: deal.branchId,
      therapistId: input.therapistId ?? null,
      therapistPackageId,
      dealPackageId,
      // Optional — never required to complete a booking (see BookingCreateSchema's doc comment).
      bookingDate: input.bookingDate ? new Date(input.bookingDate) : null,
      timeSlot: input.timeSlot ?? null,
      quantity: input.quantity,
      // Immutable snapshot — copied once here, never re-read from Deal/DealPackage/TherapistPackage again.
      priceSnapshot,
      durationMinutesSnapshot: selectedDurationMinutes,
    },
    include: BOOKING_INCLUDE,
  });
}

/** A Therapist booked directly — no Deal involved at all (see Booking's own "exactly one of
 *  dealId/therapistId" doc comment). Unlike the Deal path, there's no Deal price to fall back
 *  to, so a matching-duration active TherapistPackage is REQUIRED, not merely preferred; an
 *  absent match is rejected rather than silently priced at zero. */
async function createBookingFromTherapist(
  customerId: string,
  therapistId: string,
  durationMinutes: number,
  input: BookingCreateInput,
) {
  const therapist = await prisma.therapist.findUnique({ where: { id: therapistId } });
  if (!therapist) throw new ApiError('NOT_FOUND', 'Therapist not found');
  if (!therapist.isActive) throw new ApiError('VALIDATION_ERROR', 'Selected therapist is not currently available');

  const pkg = await prisma.therapistPackage.findFirst({
    where: { therapistId, durationMinutes, isActive: true },
  });
  if (!pkg) throw new ApiError('VALIDATION_ERROR', 'Selected therapist does not offer a package for this duration.');

  // Same customer + same therapist + same duration + still-active booking already exists — same
  // dedupe discipline as the Deal path above, keyed by therapistId+duration since there's no
  // dealId here.
  const existingActive = await prisma.booking.findFirst({
    where: {
      customerId,
      dealId: null,
      therapistId,
      durationMinutesSnapshot: durationMinutes,
      status: { in: ACTIVE_BOOKING_STATUSES },
    },
  });
  if (existingActive) {
    throw new ApiError('CONFLICT', 'Already booked. Your existing booking is still active.', {
      bookingId: existingActive.id,
    });
  }

  return prisma.booking.create({
    data: {
      customerId,
      dealId: null,
      vendorId: therapist.vendorId, // derived from the Therapist, never the client
      branchId: therapist.branchId,
      therapistId: therapist.id,
      therapistPackageId: pkg.id,
      // Optional — never required to complete a booking (see BookingCreateSchema's doc comment).
      bookingDate: input.bookingDate ? new Date(input.bookingDate) : null,
      timeSlot: input.timeSlot ?? null,
      quantity: input.quantity,
      // Immutable snapshot — copied once here, never re-read from TherapistPackage again.
      priceSnapshot: pkg.sellingPrice,
      durationMinutesSnapshot: durationMinutes,
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
  /** Admin-only drill-in filter (Customer Detail's Bookings tab) — a vendor caller stays
   *  force-scoped to its own vendorId regardless, same rule as `vendorId`. */
  customerId?: string;
}

/** Same "one endpoint, ownership-aware" shape as order.service.ts's listOrders/getOrderOrThrow —
 *  a caller who owns a Vendor profile is ALWAYS force-scoped to it; only a Vendor-less caller
 *  (admin/staff) may use the optional `vendorId` filter to drill in. */
export async function listVendorBookings(callerUserId: string, opts: BookingListFilters) {
  const vendor = await getVendorByOwnerUserId(callerUserId);
  const scopedVendorId = vendor ? vendor.id : opts.vendorId;
  const where = {
    ...(scopedVendorId ? { vendorId: scopedVendorId } : {}),
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.customerId ? { customerId: opts.customerId } : {}),
  };
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
