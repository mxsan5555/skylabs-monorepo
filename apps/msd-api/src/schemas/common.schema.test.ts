import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  dateRangeQuery,
  EmailSchema,
  isStrictObject,
  MONEY_MAX,
  MoneySchema,
  pagination,
  PaginationQuerySchema,
  PhoneSchema,
  REASON_MAX,
  REASON_MIN,
  ReasonSchema,
  sortQuery,
} from './common.schema';

/** P2-14: one definition per common field, reused by every schema. */
describe('pagination', () => {
  it('defaults to page 1 of 20 and caps the page size', () => {
    expect(PaginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(PaginationQuerySchema.parse({ page: '3', pageSize: '50' })).toEqual({ page: 3, pageSize: 50 });
    expect(PaginationQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false);
    expect(PaginationQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });

  it('takes its own cap and default', () => {
    const small = pagination({ maxPageSize: 48, defaultPageSize: 12 });
    expect(small.parse({})).toEqual({ page: 1, pageSize: 12 });
    expect(small.safeParse({ pageSize: '49' }).success).toBe(false);
  });
});

describe('sortQuery', () => {
  it('allows only the listed values, with a default', () => {
    const sort = sortQuery(['newest', 'price_asc'], 'newest');
    expect(sort.parse(undefined)).toBe('newest');
    expect(sort.parse('price_asc')).toBe('price_asc');
    expect(sort.safeParse('id; drop table').success).toBe(false);
  });
});

describe('ReasonSchema', () => {
  it('trims and keeps between the minimum and maximum length', () => {
    expect(ReasonSchema.parse('  Documents expired again  ')).toBe('Documents expired again');
    expect(ReasonSchema.safeParse('x'.repeat(REASON_MIN - 1)).success).toBe(false);
    expect(ReasonSchema.safeParse(`  ${'x'.repeat(REASON_MIN - 1)}  `).success).toBe(false);
    expect(ReasonSchema.safeParse('x'.repeat(REASON_MAX + 1)).success).toBe(false);
  });
});

describe('dateRangeQuery', () => {
  const range = dateRangeQuery(31);

  it('accepts YYYY-MM-DD dates in order within the span', () => {
    expect(range.parse({ dateFrom: '2026-10-01', dateTo: '2026-10-31' })).toEqual({ dateFrom: '2026-10-01', dateTo: '2026-10-31' });
    expect(range.parse({})).toEqual({});
  });

  it('refuses other formats, a reversed range and a longer span', () => {
    expect(range.safeParse({ dateFrom: '01/10/2026' }).success).toBe(false);
    expect(range.safeParse({ dateFrom: '2026-10-31', dateTo: '2026-10-01' }).success).toBe(false);
    expect(range.safeParse({ dateFrom: '2026-09-01', dateTo: '2026-10-31' }).success).toBe(false);
  });
});

describe('MoneySchema', () => {
  it('takes amounts in rupees with at most two decimals, never negative or above the column', () => {
    expect(MoneySchema.parse(1499.5)).toBe(1499.5);
    expect(MoneySchema.parse(0.1 + 0.2 - 0.0000000000000001)).toBeCloseTo(0.3);
    expect(MoneySchema.safeParse(10.005).success).toBe(false);
    expect(MoneySchema.safeParse(-1).success).toBe(false);
    expect(MoneySchema.safeParse(MONEY_MAX + 1).success).toBe(false);
    expect(MoneySchema.safeParse(Number.NaN).success).toBe(false);
  });
});

describe('PhoneSchema', () => {
  it('accepts an Indian mobile number with or without +91 and stores the +91 form', () => {
    expect(PhoneSchema.parse('98765 43210')).toBe('+919876543210');
    expect(PhoneSchema.parse('+919876543210')).toBe('+919876543210');
    expect(PhoneSchema.safeParse('12345').success).toBe(false);
    expect(PhoneSchema.safeParse('5876543210').success).toBe(false);
  });
});

describe('EmailSchema', () => {
  it('trims and lower-cases a valid address', () => {
    expect(EmailSchema.parse('  Hi@MySpaDeal.IN ')).toBe('hi@myspadeal.in');
    expect(EmailSchema.safeParse('not-an-email').success).toBe(false);
  });
});

describe('isStrictObject', () => {
  it('sees through refinements, transforms, optional and default wrappers', () => {
    const strict = z.object({ a: z.string() }).strict();
    expect(isStrictObject(strict)).toBe(true);
    expect(isStrictObject(strict.refine(() => true))).toBe(true);
    expect(isStrictObject(strict.transform((v) => v))).toBe(true);
    expect(isStrictObject(strict.optional())).toBe(true);
    expect(isStrictObject(z.object({ a: z.string() }))).toBe(false);
    expect(isStrictObject(z.string())).toBe(false);
  });
});
