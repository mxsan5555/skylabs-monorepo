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
