import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const ErrorObjectSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  })
  .openapi('ErrorObject');

export const UuidParamSchema = z.object({
  id: z.string().uuid(),
});

// ─── Shared field primitives (P2-14) ────────────────────────────────────────────────────────
// One definition per common field. New schemas use these instead of restating the rule.

/** `page` (from 1) and `pageSize` (1 to `maxPageSize`) query params. */
export function pagination({ maxPageSize = 100, defaultPageSize = 20 } = {}) {
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(maxPageSize).default(defaultPageSize),
  });
}

export const PaginationQuerySchema = pagination();

/** A `sort` param limited to an allowlist, never a free column name. */
export function sortQuery<const T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) {
  return z.enum(values).default(fallback as never);
}

export const REASON_MIN = 10;
export const REASON_MAX = 500;

/** Reason for a status change, rejection or refund: trimmed, 10 to 500 characters. */
export const ReasonSchema = z.string().trim().min(REASON_MIN).max(REASON_MAX);

/** `YYYY-MM-DD`, no time part. */
export const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** Optional `dateFrom` / `dateTo` (`YYYY-MM-DD`): from on or before to, at most `maxDays` apart. */
export function dateRangeQuery(maxDays: number) {
  const day = z.string().regex(DATE_ONLY_REGEX, 'must be YYYY-MM-DD');
  return z
    .object({ dateFrom: day.optional(), dateTo: day.optional() })
    .superRefine(({ dateFrom, dateTo }, ctx) => {
      if (!dateFrom || !dateTo) return;
      const span = (Date.parse(dateTo) - Date.parse(dateFrom)) / DAY_MS;
      if (span < 0) ctx.addIssue({ code: 'custom', message: 'dateFrom must be on or before dateTo', path: ['dateTo'] });
      else if (span > maxDays) ctx.addIssue({ code: 'custom', message: `range must be at most ${maxDays} days`, path: ['dateTo'] });
    });
}

/** Largest amount a `Decimal(12,2)` column holds. */
export const MONEY_MAX = 9_999_999_999.99;
const PAISE = 100;
const FLOAT_TOLERANCE = 1e-6;

/** Rupees: not negative, at most two decimals, fits `Decimal(12,2)`. */
export const MoneySchema = z
  .number()
  .finite()
  .nonnegative()
  .max(MONEY_MAX)
  .refine((v) => Math.abs(v * PAISE - Math.round(v * PAISE)) < FLOAT_TOLERANCE, 'at most 2 decimal places');

const INDIA_MOBILE = /^(?:\+91)?([6-9]\d{9})$/;
const MOBILE_DIGITS = 10;

/** Indian mobile number, bare or `+91`, spaces and dashes allowed; stored as `+91XXXXXXXXXX`
 *  (the same form `normalizeIdentifier` gives OTP phones). */
export const PhoneSchema = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(INDIA_MOBILE, 'must be a 10-digit Indian mobile number'))
  .transform((v) => `+91${v.slice(-MOBILE_DIGITS)}`);

/** Longest address SMTP delivers (RFC 5321 path limit). */
const EMAIL_MAX = 254;

/** Email address, trimmed and lower-cased. */
export const EmailSchema = z.string().trim().toLowerCase().max(EMAIL_MAX).pipe(z.email());

/** True when `schema` (through refinements, transforms, optional, nullable and default) is a
 *  `.strict()` object: unknown keys are refused with 422 instead of passed on (mass assignment). */
export function isStrictObject(schema: z.ZodType): boolean {
  let current: z.ZodType | undefined = schema;
  while (current) {
    if (current instanceof z.ZodObject) return current._zod.def.catchall instanceof z.ZodNever;
    const def = current._zod.def as { innerType?: z.ZodType; in?: z.ZodType };
    current = def.innerType ?? def.in;
  }
  return false;
}
