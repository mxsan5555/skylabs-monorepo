import { describe, expect, it } from 'vitest';
import { formatINR, pluralize, inputValue } from './format';

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