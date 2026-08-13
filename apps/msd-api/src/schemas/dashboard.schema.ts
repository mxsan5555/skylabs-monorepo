import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const DashboardStatsResponseSchema = z
  .object({
    vendors: z.number().int(),
    customers: z.number().int(),
    branches: z.number().int(),
    categories: z.number().int(),
    subCategories: z.number().int(),
    services: z.number().int(),
    products: z.number().int(),
    deals: z.number().int(),
    orders: z.number().int(),
    bookings: z.number().int(),
    /** Sum of Payment.amount where status='PAID' — a Decimal serialized to a plain string,
     *  matching how every other Decimal field is already returned by this API (e.g. Order.total). */
    revenue: z.string(),
  })
  .openapi('DashboardStatsResponse');
