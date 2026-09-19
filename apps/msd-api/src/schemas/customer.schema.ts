import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';

extendZodWithOpenApi(z);

export const CustomerListQuerySchema = PaginationQuerySchema.extend({
  /** Free-text search across name/phone/email. */
  search: z.string().max(200).optional(),
  status: z.enum(['active', 'inactive', 'blocked']).optional(),
});

/** The DB/enum value stays `blocked` (see `UserStatus` in schema.prisma — shared with staff/
 *  vendor accounts, not renamed to avoid an unnecessary migration across every account type);
 *  the Customer Management UI labels it "Suspended". Only these 3 values are ever accepted —
 *  arbitrary status strings are rejected by this enum, not just documented against. */
export const CustomerStatusUpdateSchema = z
  .object({ status: z.enum(['active', 'inactive', 'blocked']) })
  .openapi('CustomerStatusUpdate');
