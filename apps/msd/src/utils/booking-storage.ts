import type { Booking } from '../types';
const STORAGE_KEY = 'msd_bookings';
export function getBookings(): Booking[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Booking[]) : [];
  } catch { return []; }
}
export function saveBooking(booking: Booking): void {
  const bookings = getBookings();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify([booking, ...bookings]),
  );
}
export function clearBookings(): void {
  localStorage.removeItem(STORAGE_KEY);
}