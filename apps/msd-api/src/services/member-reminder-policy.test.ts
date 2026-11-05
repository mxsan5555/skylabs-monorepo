import { describe, it, expect } from 'vitest';
import {
  DOCUMENTS_DUE_DAYS,
  MANUAL_REMINDER_COOLDOWN_HOURS,
  REMINDER_COUNT,
  REMINDER_INTERVAL_DAYS,
  REVIEW_FLAG_AFTER_FINAL_DAYS,
  documentsDueAt,
  isRemindable,
  isReviewDue,
  manualReminderBlockedUntil,
  nextWarning,
} from './member-reminder-policy';

const DAY = 24 * 60 * 60 * 1000;
const CREATED = new Date('2026-10-01T04:30:00Z');
const DUE = documentsDueAt(CREATED);
const day = (n: number) => new Date(CREATED.getTime() + n * DAY);

describe('member reminder policy', () => {
  it('matches the agreed timeline: due day 14, warnings a week apart, flag on day 35', () => {
    expect(DOCUMENTS_DUE_DAYS).toBe(14);
    expect(REMINDER_INTERVAL_DAYS).toBe(7);
    expect(REMINDER_COUNT).toBe(3);
    expect(DOCUMENTS_DUE_DAYS + (REMINDER_COUNT - 1) * REMINDER_INTERVAL_DAYS + REVIEW_FLAG_AFTER_FINAL_DAYS).toBe(35);
    expect(DUE).toEqual(day(14));
  });

  it('reminds active and inactive members only', () => {
    expect(isRemindable('ACTIVE')).toBe(true);
    expect(isRemindable('INACTIVE')).toBe(true);
    expect(isRemindable('SUSPENDED')).toBe(false);
    expect(isRemindable('ARCHIVED')).toBe(false);
  });

  describe('nextWarning', () => {
    it('sends nothing before the due date', () => {
      expect(nextWarning(DUE, [], day(13))).toBeNull();
    });

    it('sends warning 1 on the due date', () => {
      expect(nextWarning(DUE, [], day(14))).toBe(1);
    });

    it('waits a full week after the previous warning', () => {
      const delivered = [{ sequence: 1, sentAt: day(14) }];
      expect(nextWarning(DUE, delivered, day(20))).toBeNull();
      expect(nextWarning(DUE, delivered, day(21))).toBe(2);
    });

    it('after missed runs, sends only the next warning, then keeps the spacing', () => {
      expect(nextWarning(DUE, [], day(40))).toBe(1);
      expect(nextWarning(DUE, [{ sequence: 1, sentAt: day(40) }], day(41))).toBeNull();
    });

    it('stops after the final warning', () => {
      const delivered = [1, 2, 3].map((sequence) => ({ sequence, sentAt: day(7 + sequence * 7) }));
      expect(nextWarning(DUE, delivered, day(60))).toBeNull();
    });
  });

  describe('isReviewDue', () => {
    const delivered = [
      { sequence: 1, sentAt: day(14) },
      { sequence: 2, sentAt: day(21) },
      { sequence: 3, sentAt: day(28) },
    ];

    it('is false without the final warning', () => {
      expect(isReviewDue(delivered.slice(0, 2), day(60))).toBe(false);
    });

    it('waits one week after the final warning (day 35)', () => {
      expect(isReviewDue(delivered, day(34))).toBe(false);
      expect(isReviewDue(delivered, day(35))).toBe(true);
    });

    it('counts the week from when the final warning really went out', () => {
      const late = [...delivered.slice(0, 2), { sequence: 3, sentAt: day(30) }];
      expect(isReviewDue(late, day(36))).toBe(false);
      expect(isReviewDue(late, day(37))).toBe(true);
    });
  });

  describe('manualReminderBlockedUntil', () => {
    const now = day(20);
    const hours = (n: number) => new Date(now.getTime() - n * 60 * 60 * 1000);

    it('allows the first manual reminder', () => {
      expect(manualReminderBlockedUntil(null, now)).toBeNull();
    });

    it('blocks inside the cooldown and allows after it', () => {
      expect(manualReminderBlockedUntil(hours(MANUAL_REMINDER_COOLDOWN_HOURS - 1), now)).not.toBeNull();
      expect(manualReminderBlockedUntil(hours(MANUAL_REMINDER_COOLDOWN_HOURS), now)).toBeNull();
    });
  });
});
