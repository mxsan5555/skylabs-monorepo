import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';

extendZodWithOpenApi(z);

export const CustomerListQuerySchema = PaginationQuerySchema.extend({
  /** Free-text search across name/phone/email. */
  search: z.string().max(200).optional(),
  status: z.enum(['active', 'inactive', 'blocked']).optional(),
});
