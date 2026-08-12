import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema } from './common.schema';

extendZodWithOpenApi(z);

export const BookingListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED']).optional(),
});

export const BookingCreateSchema = z
  .object({
    dealId: z.string().uuid(),
    bookingDate: z.string().datetime(),
    timeSlot: z.string().min(1).max(50),
    quantity: z.number().int().min(1).max(20).default(1),
  })
  .openapi('BookingCreate');

/** Customer self-service may only ever cancel — confirming/completing a booking is a later,
 *  vendor/admin-facing phase (explicitly out of scope here). */
export const BookingCancelSchema = z
  .object({
    status: z.literal('CANCELLED'),
    cancellationReason: z.string().max(500).optional(),
  })
  .openapi('BookingCancel');
