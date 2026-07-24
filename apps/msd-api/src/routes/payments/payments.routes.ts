import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma-client';
import { badRequest, notFound } from '../../lib/api-error';
import { requireAuth, type AuthedRequest } from '../../middleware/require-auth';
import { registry } from '../../lib/openapi-registry';
import { verifyCheckoutSignature, verifyWebhookSignature, fetchRazorpayPayment } from '../../lib/razorpay';
import { markPaymentCaptured, markPaymentFailed } from './payments.service';
import { toOrderDetail, orderInclude } from '../orders/orders.service';
import type { PaymentMethod } from '../../generated/prisma';

const confirmPaymentSchema = z.object({
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
});

registry.registerPath({
  method: 'post',
  path: '/orders/{id}/confirm-payment',
  summary: 'Client-side fallback: verify the Razorpay checkout signature after widget success',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: confirmPaymentSchema } } } },
  responses: { 200: { description: 'Order confirmed' }, 400: { description: 'Invalid signature' } },
});

function toPaymentMethod(razorpayMethod: string | undefined): PaymentMethod | null {
  switch (razorpayMethod) {
    case 'upi':
      return 'UPI';
    case 'card':
      return 'CARD';
    case 'netbanking':
      return 'NETBANKING';
    case 'wallet':
      return 'WALLET';
    default:
      return null;
  }
}

export const paymentsRouter = Router();

paymentsRouter.post('/orders/:id/confirm-payment', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = confirmPaymentSchema.parse(req.body);
    const order = await prisma.order.findFirst({ where: { id: req.params.id, userId: req.auth!.id } });
    if (!order) throw notFound('order_not_found');

    const valid = verifyCheckoutSignature(
      input.razorpay_order_id,
      input.razorpay_payment_id,
      input.razorpay_signature,
    );
    if (!valid) throw badRequest('invalid_signature');

    const rpPayment = await fetchRazorpayPayment(input.razorpay_payment_id);
    await markPaymentCaptured(
      input.razorpay_order_id,
      input.razorpay_payment_id,
      toPaymentMethod(typeof rpPayment.method === 'string' ? rpPayment.method : undefined),
    );

    const fresh = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
    res.json(toOrderDetail(fresh));
  } catch (err) {
    next(err);
  }
});

/** Mounted separately in app.ts with express.raw() — the signature is computed over the
 *  raw request body, so it must not be JSON-parsed first. */
export async function handleRazorpayWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = (req.body as Buffer).toString('utf8');
    if (typeof signature !== 'string' || !verifyWebhookSignature(rawBody, signature)) {
      res.status(400).json({ error: 'invalid_signature' });
      return;
    }

    const event = JSON.parse(rawBody) as {
      event: string;
      payload: { payment: { entity: { id: string; order_id: string; method?: string; error_description?: string } } };
    };
    const entity = event.payload.payment.entity;

    if (event.event === 'payment.captured') {
      await markPaymentCaptured(entity.order_id, entity.id, toPaymentMethod(entity.method));
    } else if (event.event === 'payment.failed') {
      await markPaymentFailed(entity.order_id, entity.error_description ?? 'payment_failed');
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
}
