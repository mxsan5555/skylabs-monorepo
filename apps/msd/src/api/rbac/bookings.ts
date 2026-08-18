import { apiGet, apiPatch } from './client';

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

export interface BookingDealService {
  id: string;
  name: string;
  image: string | null;
  imageAlt: string | null;
}

export interface BookingDeal {
  id: string;
  title: string;
  slug: string;
  images: string[];
  service: BookingDealService | null;
}

export interface Booking {
  id: string;
  customerId: string;
  /** Nullable — absent for a Therapist booked directly (no Deal involved at all). */
  dealId: string | null;
  vendorId: string;
  branchId: string;
  /** Nullable — this is a service purchase, not an appointment-scheduling system; the customer
   *  is never required to pick a date/time to complete a booking. */
  bookingDate: string | null;
  timeSlot: string | null;
  quantity: number;
  priceSnapshot: string;
  durationMinutesSnapshot: number | null;
  status: BookingStatus;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  /** Null for a Therapist booked directly — see `dealId` above. */
  deal: BookingDeal | null;
  therapist: { id: string; therapistType: string; personName: string; specialization: string | null; photoUrl: string | null } | null;
  vendor: { id: string; businessName: string | null };
  branch: { id: string; name: string; address: string | null; city: string | null };
  customer: { id: string; name: string; phone: string | null; email: string | null };
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export interface ListVendorBookingsOpts {
  page?: number;
  pageSize?: number;
  status?: BookingStatus;
  /** Admin-only drill-in filter — ignored server-side for a vendor caller, who is always
   *  force-scoped to their own vendor — see booking.service.ts#listVendorBookings. */
  vendorId?: string;
  /** Admin-only drill-in filter (Customer Detail's Bookings tab) — same rule as `vendorId`. */
  customerId?: string;
}

/** Admin sees every booking behind a SERVICE order (optionally ?vendorId=); a vendor caller
 *  is force-scoped server-side to its own vendor regardless of any param sent here. Reuses the
 *  existing `orders` permission key — there is no separate `bookings` permission. */
export function listVendorBookings(token: string | null, opts: ListVendorBookingsOpts = {}) {
  return apiGet<Booking[]>(`/bookings/vendor${toQuery(opts)}`, token);
}

export function getVendorBooking(token: string | null, id: string) {
  return apiGet<Booking>(`/bookings/vendor/${id}`, token);
}

export function setVendorBookingStatus(token: string | null, id: string, status: BookingStatus, cancellationReason?: string) {
  return apiPatch<Booking>(`/bookings/vendor/${id}/status`, token, { status, cancellationReason });
}
