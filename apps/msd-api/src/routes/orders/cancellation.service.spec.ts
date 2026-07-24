import { describe, it, expect } from 'vitest';
import { hoursUntilBooking, computeCancellationOutcome } from './cancellation.service';

describe('cancellation.service', () => {
  describe('hoursUntilBooking', () => {
    it('returns a positive number for a future booking', () => {
      const now = new Date('2026-08-01T10:00:00');
      const hours = hoursUntilBooking('2026-08-02', '10:00', now);
      expect(hours).toBeCloseTo(24, 1);
    });

    it('returns a negative number for a past booking', () => {
      const now = new Date('2026-08-02T10:00:00');
      const hours = hoursUntilBooking('2026-08-01', '10:00', now);
      expect(hours).toBeCloseTo(-24, 1);
    });
  });

  describe('computeCancellationOutcome', () => {
    it('grants a full refund when cancelling outside the free-cancel window', () => {
      const result = computeCancellationOutcome(24, 0, 48);
      expect(result).toEqual({ outcome: 'FULL_REFUND', refundPct: 100 });
    });

    it('grants a full refund exactly at the free-cancel boundary', () => {
      const result = computeCancellationOutcome(24, 0, 24);
      expect(result.outcome).toBe('FULL_REFUND');
    });

    it('grants a partial refund inside the window when the policy allows one', () => {
      const result = computeCancellationOutcome(24, 50, 5);
      expect(result).toEqual({ outcome: 'PARTIAL_REFUND', refundPct: 50 });
    });

    it('grants no refund inside the window when the policy has no partial refund', () => {
      const result = computeCancellationOutcome(24, 0, 5);
      expect(result).toEqual({ outcome: 'NO_REFUND', refundPct: 0 });
    });

    it('grants no refund for a booking already in the past', () => {
      const result = computeCancellationOutcome(24, 0, -10);
      expect(result.outcome).toBe('NO_REFUND');
    });
  });
});
