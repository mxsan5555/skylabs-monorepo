import type { CancellationOutcome } from '../../generated/prisma';

export function hoursUntilBooking(bookingDate: string, bookingTime: string, now: Date = new Date()): number {
  const bookingAt = new Date(`${bookingDate}T${bookingTime}:00`);
  return (bookingAt.getTime() - now.getTime()) / (1000 * 60 * 60);
}

/** Mirrors 05-deals.md's CancellationPolicy: full refund outside the free-cancel
 *  window, the policy's partial % inside it (if any), otherwise no refund. */
export function computeCancellationOutcome(
  freeCancelHoursBefore: number,
  partialRefundPct: number,
  hoursUntil: number,
): { outcome: CancellationOutcome; refundPct: number } {
  if (hoursUntil >= freeCancelHoursBefore) return { outcome: 'FULL_REFUND', refundPct: 100 };
  if (partialRefundPct > 0) return { outcome: 'PARTIAL_REFUND', refundPct: partialRefundPct };
  return { outcome: 'NO_REFUND', refundPct: 0 };
}
