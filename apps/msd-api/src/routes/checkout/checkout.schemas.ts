import { z } from 'zod';

export const checkoutRequestSchema = z.object({
  contact: z.object({
    name: z.string().min(1).max(120),
    phone: z.string().min(6).max(20),
    email: z.string().email(),
  }),
  items: z
    .array(
      z.object({
        cartItemId: z.string().min(1),
        bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        bookingTime: z.string().regex(/^\d{2}:\d{2}$/),
      }),
    )
    .min(1),
});
