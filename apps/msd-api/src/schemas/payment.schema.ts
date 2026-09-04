import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

/** Body posted by the checkout widget's success handler — Razorpay's own field names, snake_case. */
export const VerifyPaymentSchema = z
  .object({
    razorpay_order_id: z.string().min(1),
    razorpay_payment_id: z.string().min(1),
    razorpay_signature: z.string().min(1),
  })
  .openapi('VerifyPayment');

/** Combined checkout (Deal + Therapist + Product together — one checkout action, one payment,
 *  multiple Order rows under the hood) — every `*Batch` payment endpoint takes the same set of
 *  Order ids created together in that one checkout action. */
export const OrderBatchSchema = z
  .object({
    orderIds: z.array(z.string().uuid()).min(1),
  })
  .openapi('OrderBatch');

export const VerifyBatchPaymentSchema = OrderBatchSchema.extend({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
}).openapi('VerifyBatchPayment');
