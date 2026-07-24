import { z } from 'zod';

export const cartItemAddSchema = z.object({
  dealId: z.string().min(1),
  pricingPlanId: z.string().optional(), // defaults to the deal's cheapest active plan
  locationId: z.string().optional(), // defaults to the deal's first linked location
  quantity: z.number().int().min(1).max(10).default(1),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  bookingTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export const cartItemUpdateSchema = z.object({
  quantity: z.number().int().min(1).max(10).optional(),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  bookingTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export const promoApplySchema = z.object({ code: z.string().min(1) });
