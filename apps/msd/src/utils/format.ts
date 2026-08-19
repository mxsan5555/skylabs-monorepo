export const formatINR = (n: number): string =>
  `₹${n.toLocaleString('en-IN')}`;

export const pluralize = (count: number, singular: string, plural = `${singular}s`): string =>
  count === 1 ? singular : plural;

export const inputValue = (e: Event): string =>
  (e.target as unknown as { value: string }).value;

/** A Booking's date/time is optional (this is a service purchase, not an appointment-scheduling
 *  system — see Booking's own schema doc comment in msd-api) — renders "Not scheduled" instead
 *  of "Invalid Date" when the customer never picked one. */
export const formatBookingSchedule = (bookingDate: string | null, timeSlot: string | null): string =>
  bookingDate && timeSlot ? `${new Date(bookingDate).toLocaleDateString()} · ${timeSlot}` : 'Not scheduled';

/** A Booking's `deal` is null for a Therapist booked directly (no Deal involved at all — see
 *  Booking's own "exactly one of dealId/therapistId" doc comment in msd-api). Duck-typed (not
 *  imported from `api/bookings.ts`) so it also fits the admin/vendor booking list shapes, which
 *  carry the same `deal`/`therapist` fields via their own local types. */
export const bookingDisplayName = (booking: {
  deal: { title: string; service?: { name: string } | null } | null;
  therapist: { therapistType: string; personName: string } | null;
}): string => {
  if (booking.deal) return booking.deal.service?.name ?? booking.deal.title;
  if (booking.therapist) return `${booking.therapist.therapistType} — ${booking.therapist.personName}`;
  return 'Booking';
};
