import { apiGet, apiPost, apiPatch } from './rbac/client';

/**
 * Customer service bookings — authenticated, self-service only (backend gates on
 * `authenticate` alone, no RBAC permission — see msd-api's `booking.routes.ts` doc comment).
 */

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

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
  /** Null for a Therapist booked directly — see `dealId` above. */
  deal: {
    id: string;
    title: string;
    slug: string;
    images: string[] | null;
    service: { id: string; name: string; image: string | null; imageAlt: string | null } | null;
  } | null;
  vendor: { id: string; businessName: string | null };
  branch: { id: string; name: string; address: string | null; city: string | null };
  therapist: { id: string; therapistType: string; personName: string; specialization: string | null; photoUrl: string | null } | null;
  /** Which of the Deal's own packages priced this booking — null for a legacy/safety-net deal
   *  with zero packages, or a Therapist booked directly. */
  dealPackage: { id: string; durationMinutes: number; sellingPrice: string } | null;
}

export interface BookingInput {
  /** Absent for a Therapist booked directly — see Booking's own doc comment. Exactly one of
   *  dealId/therapistId is required. */
  dealId?: string;
  /** Optional — omit both (never just one) when the customer didn't pick a date/time. */
  bookingDate?: string;
  timeSlot?: string;
  quantity?: number;
  /** When `dealId` is set: omit entirely for "any therapist" — the API assigns automatically.
   *  Required when the deal has active therapist packages (enforced server-side). When `dealId`
   *  is absent: REQUIRED — this is a direct Therapist booking. */
  therapistId?: string;
  /** Required when `dealId` is absent — selects which of the Therapist's packages to book. */
  durationMinutes?: number;
  /** Required when `dealId` is set AND the deal has active packages (the normal case — see
   *  DealPackage's schema doc comment in msd-api) — selects which of the Deal's own
   *  duration/price packages to book. */
  dealPackageId?: string;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Lightweight pub/sub, same pattern as `api/cart.ts`'s `subscribeCartUpdated` — so the header's
 * cart-count badge (which counts PENDING bookings alongside Product CartItems, since a Deal or
 * Therapist booked directly is just as much "in the cart" as a product — see cart.tsx's own doc
 * comment) refetches whenever a booking is created/cancelled here, or consumed into an Order by
 * `api/orders.ts#createOrderFromBooking`. Exported (unlike cart.ts's private notifier) because
 * that last mutation lives in a different module.
 */
type BookingListener = () => void;
const listeners = new Set<BookingListener>();

export function subscribeBookingsUpdated(listener: BookingListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyBookingsUpdated() {
  listeners.forEach((listener) => listener());
}

export function listBookings(token: string | null, opts: { page?: number; pageSize?: number; status?: BookingStatus } = {}) {
  return apiGet<Booking[]>(`/bookings${toQuery(opts)}`, token);
}

export function createBooking(token: string | null, input: BookingInput) {
  return apiPost<Booking>('/bookings', token, input).then((res) => {
    notifyBookingsUpdated();
    return res;
  });
}

export function getBooking(token: string | null, id: string) {
  return apiGet<Booking>(`/bookings/${id}`, token);
}

export function cancelBooking(token: string | null, id: string, cancellationReason?: string) {
  return apiPatch<Booking>(`/bookings/${id}/status`, token, { status: 'CANCELLED', cancellationReason }).then((res) => {
    notifyBookingsUpdated();
    return res;
  });
}
