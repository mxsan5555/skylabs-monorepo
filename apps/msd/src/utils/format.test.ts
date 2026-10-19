import { describe, expect, it } from 'vitest';
import { formatINR, pluralize, inputValue, formatTime12h } from './format';

describe('formatINR', () => {
  it('formats a number as INR', () => {
    expect(formatINR(1000)).toBe('₹1,000');
  });

  it('formats zero correctly', () => {
    expect(formatINR(0)).toBe('₹0');
  });

  it('formats large numbers using Indian number formatting', () => {
    expect(formatINR(1234567)).toBe('₹12,34,567');
  });

  it('formats decimal numbers correctly', () => {
    expect(formatINR(999.99)).toBe('₹999.99');
  });
});

describe('pluralize', () => {
  it('returns the singular form when count is 1', () => {
    expect(pluralize(1, 'deal')).toBe('deal');
  });

  it('returns the default plural form when count is greater than 1', () => {
    expect(pluralize(2, 'deal')).toBe('deals');
  });

  it('returns the plural form when count is 0', () => {
    expect(pluralize(0, 'deal')).toBe('deals');
  });

  it('supports a custom plural form', () => {
    expect(pluralize(2, 'category', 'categories')).toBe('categories');
  });
});

/** Feature: Branch working-hours 12-hour display (Branch schedule audit) — the only place a
 *  stored "HH:MM" opening/closing time is ever converted to the 12-hour format the storefront
 *  actually shows the customer. */
describe('formatTime12h', () => {
  it('formats the exact example from the bug report — 10:00 → 10:00 AM, 20:00 → 08:00 PM', () => {
    expect(formatTime12h('10:00')).toBe('10:00 AM');
    expect(formatTime12h('20:00')).toBe('08:00 PM');
  });

  it('handles midnight and noon correctly (the classic 12-hour edge cases)', () => {
    expect(formatTime12h('00:00')).toBe('12:00 AM');
    expect(formatTime12h('12:00')).toBe('12:00 PM');
  });

  it('handles the last minute of the morning/evening correctly', () => {
    expect(formatTime12h('11:59')).toBe('11:59 AM');
    expect(formatTime12h('23:59')).toBe('11:59 PM');
  });

  it('returns the raw input unchanged for anything that is not a valid HH:MM 24-hour string', () => {
    expect(formatTime12h('closed')).toBe('closed');
    expect(formatTime12h('')).toBe('');
  });
});

describe('inputValue', () => {
  it('extracts the value from an input event', () => {
    const input = document.createElement('input');
    input.value = 'test value';

    const event = new Event('input');
    Object.defineProperty(event, 'target', {
      value: input,
    });

    expect(inputValue(event)).toBe('test value');
  });

  it('returns an empty string when the input is empty', () => {
    const input = document.createElement('input');
    input.value = '';

    const event = new Event('input');
    Object.defineProperty(event, 'target', {
      value: input,
    });

    expect(inputValue(event)).toBe('');
  });
});