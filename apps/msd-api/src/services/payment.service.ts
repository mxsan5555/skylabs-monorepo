import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { razorpay } from '../lib/razorpay';
import { env } from '../config/env';
import { ApiError } from '../lib/http';
import { getMyOrderOrThrow } from './order.service';

/**
 * Razorpay integration for the existing Order (Phase 8) — see the Phase 9 architecture plan.
 * `Payment` is `Order 1 -> Payment[]` (not 1:1): a retry after FAILED/CANCELLED creates a new
 * row against the SAME Order, never a new Order. Amount always comes from the server-read
 * `Order.total` — never a client-supplied number.
 */

/**
 * Creates a Razorpay order for the caller's own Order, or reuses an existing non-terminal
 * attempt — this IS the idempotency mechanism for "customer clicks Pay twice": a second call
 * before the first attempt resolves returns the same `providerOrderId` instead of minting a
 * new one, so Razorpay's checkout widget reopens against the identical attempt.
 */
export async function createOrReusePayment(customerId: string, orderId: string) {
  const order = await getMyOrderOrThrow(customerId, orderId);
  if (order.status !== 'PENDING_PAYMENT') {
    throw new ApiError('CONFLICT', `Cannot pay for an order with status ${order.status}`);
  }

  const existing = await prisma.payment.findFirst({
    where: { orderId: order.id, status: 'CREATED' },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    return { providerOrderId: existing.providerOrderId, amount: existing.amount, currency: existing.currency, keyId: env.razorpayKeyId };
  }

  // Server-computed from the authoritative Order.total — never trusts a cart/checkout total
  // the frontend might send.
  const amountPaise = Math.round(Number(order.total) * 100);
  const providerOrder = await razorpay.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt: order.id,
  });

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      providerOrderId: providerOrder.id,
      amount: order.total,
      currency: 'INR',
      status: 'CREATED',
    },
  });

  return { providerOrderId: payment.providerOrderId, amount: payment.amount, currency: payment.currency, keyId: env.razorpayKeyId };
}

interface VerifyPaymentInput {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/**
 * The checkout widget's success-callback path — verifies Razorpay's documented client
 * signature formula (`HMAC_SHA256(order_id + "|" + payment_id, key_secret)`) independently on
 * the server before ever marking anything PAID. Idempotent: if the webhook (§ below) already
 * won the race and marked this Payment PAID, this is a no-op, not a re-processing.
 */
export async function verifyPayment(customerId: string, orderId: string, input: VerifyPaymentInput) {
  const order = await getMyOrderOrThrow(customerId, orderId);
  const payment = await prisma.payment.findUnique({ where: { providerOrderId: input.razorpay_order_id } });
  if (!payment || payment.orderId !== order.id) {
    throw new ApiError('NOT_FOUND', 'Payment not found for this order');
  }
  if (payment.status === 'PAID') {
    return { order, payment };
  }

  const expectedSignature = crypto
    .createHmac('sha256', env.razorpayKeySecret)
    .update(`${input.razorpay_order_id}|${input.razorpay_payment_id}`)
    .digest('hex');

  if (expectedSignature !== input.razorpay_signature) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: 'Signature verification failed' } });
    throw new ApiError('VALIDATION_ERROR', 'Payment signature verification failed');
  }

  const [updatedPayment, updatedOrder] = await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'PAID', providerPaymentId: input.razorpay_payment_id, signatureVerified: true },
    }),
    prisma.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED' } }),
  ]);

  return { order: updatedOrder, payment: updatedPayment };
}

/** HMAC-SHA256 of the RAW request body against RAZORPAY_WEBHOOK_SECRET — Razorpay's documented
 *  webhook verification mechanism. Must run against the exact raw bytes Razorpay signed, not a
 *  re-serialized JSON.stringify of the parsed body (see app.ts's express.json verify callback). */
export function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', env.razorpayWebhookSecret).update(rawBody).digest('hex');
  return expected === signature;
}

interface RazorpayWebhookBody {
  event: string;
  payload: {
    payment: {
      entity: {
        id: string;
        order_id: string;
        error_description?: string;
      };
    };
  };
}

/**
 * The authoritative confirmation path (fires even if the customer closes the tab before
 * `verifyPayment` runs). Never trusts any orderId/customerId in the payload directly — only
 * ever looks up OUR Payment row by the provider's own `order_id`, which we minted ourselves in
 * `createOrReusePayment`. Idempotent: a Payment already in a terminal state (PAID/FAILED) makes
 * this a no-op, so Razorpay's automatic webhook retries on non-2xx can never double-process.
 */
export async function handleWebhookEvent(body: RazorpayWebhookBody): Promise<void> {
  const entity = body.payload?.payment?.entity;
  if (!entity?.order_id) return;

  const payment = await prisma.payment.findUnique({ where: { providerOrderId: entity.order_id } });
  if (!payment) return; // unknown to us — never create anything from webhook data alone
  if (payment.status === 'PAID' || payment.status === 'FAILED') return; // already terminal

  if (body.event === 'payment.captured') {
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'PAID', providerPaymentId: entity.id, signatureVerified: true },
      }),
      prisma.order.update({ where: { id: payment.orderId }, data: { status: 'CONFIRMED' } }),
    ]);
  } else if (body.event === 'payment.failed') {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', failureReason: entity.error_description ?? 'Payment failed', providerPaymentId: entity.id },
    });
  }
}
