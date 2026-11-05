import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';
import { normalizeIdentifier } from '../lib/normalizeIdentifier';

extendZodWithOpenApi(z);

export const CustomerListQuerySchema = PaginationQuerySchema.extend({
  /** Free-text search across name/phone/email. */
  search: z.string().max(200).optional(),
  status: z.enum(['active', 'inactive', 'blocked']).optional(),
});

/** `Customer` ("User" holding the `customer` role) phone IS a login identifier — same
 *  normalize-then-validate discipline as `rbac.schema.ts`'s `userPhoneSchema`, so an admin-created
 *  customer's phone is stored in the exact `+91XXXXXXXXXX` form a real OTP login resolves to. */
const INDIA_MOBILE_REGEX = /^\+91[6-9]\d{9}$/;
const customerPhoneSchema = z
  .string()
  .max(30)
  .transform((v) => (v === '' ? v : normalizeIdentifier(v)))
  .refine((v) => v === '' || INDIA_MOBILE_REGEX.test(v), { message: 'Enter a valid 10-digit mobile number' })
  .optional();

/**
 * Super Admin adding a customer directly (matrix: Customers = VC) — no password/OTP field exists
 * (auth is OTP-only); this creates the same bare `name`/`email`/`phone` row a real signup would,
 * with no `lastLoginAt`/verified-OTP shortcut, so an admin-created customer looks exactly like a
 * brand-new unauthenticated account until they actually complete a real OTP login themselves.
 */
export const CustomerCreateSchema = z
  .object({
    name: z.string().min(1).max(150),
    email: z.string().email().optional(),
    phone: customerPhoneSchema,
  })
  .strict()
  .openapi('CustomerCreate');

/** The DB/enum value stays `blocked` (see `UserStatus` in schema.prisma — shared with staff/
 *  vendor accounts, not renamed to avoid an unnecessary migration across every account type);
 *  the Customer Management UI labels it "Suspended". Only these 3 values are ever accepted —
 *  arbitrary status strings are rejected by this enum, not just documented against. */
export const CustomerStatusUpdateSchema = z
  .object({ status: z.enum(['active', 'inactive', 'blocked']) })
  .openapi('CustomerStatusUpdate');
