import { apiGet, apiPost, apiPatch } from './rbac/client';

/**
 * Customer service bookings — authenticated, self-service only (backend gates on
 * `authenticate` alone, no RBAC permission — see msd-api's `booking.routes.ts` doc comment).
 */

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

export interface Booking {
  id: string;
  customerId: string;
  dealId: string;
  vendorId: string;
  branchId: string;
  bookingDate: string;
  timeSlot: string;
  quantity: number;
  priceSnapshot: string;
  durationMinutesSnapshot: number | null;
  status: BookingStatus;
  cancellationReason: string | null;
  createdAt: string;
  deal: {
    id: string;
    title: string;
    slug: string;
    images: string[] | null;
    service: { id: string; name: string; image: string | null; imageAlt: string | null } | null;
  };
  vendor: { id: string; businessName: string | null };
  branch: { id: string; name: string; address: string | null; city: string | null };
}

export interface BookingInput {
  dealId: string;
  bookingDate: string;
  timeSlot: string;
  quantity?: number;
  /** Omit entirely for "any therapist" — the API assigns automatically. */
  therapistId?: string;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export function listBookings(token: string | null, opts: { page?: number; pageSize?: number; status?: BookingStatus } = {}) {
  return apiGet<Booking[]>(`/bookings${toQuery(opts)}`, token);
}

export function createBooking(token: string | null, input: BookingInput) {
  return apiPost<Booking>('/bookings', token, input);
}

export function getBooking(token: string | null, id: string) {
  return apiGet<Booking>(`/bookings/${id}`, token);
}

export function cancelBooking(token: string | null, id: string, cancellationReason?: string) {
  return apiPatch<Booking>(`/bookings/${id}/status`, token, { status: 'CANCELLED', cancellationReason });
}
