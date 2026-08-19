import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { razorpay } from '../lib/razorpay';
import { env } from '../config/env';
import { ApiError } from '../lib/http';
import { Prisma } from '../generated/prisma-client';
import { getMyOrderOrThrow, cascadeBookingStatus } from './order.service';

/**
 * Razorpay integration for the existing Order (Phase 8) — see the Phase 9 architecture plan.
 * `Payment` is `Order 1 -> Payment[]` (not 1:1): a retry after FAILED/CANCELLED creates a new
 * row against the SAME Order, never a new Order. Amount always comes from the server-read
 * `Order.total` — never a client-supplied number.
 */

/**
 * Wraps every `razorpay.orders.create` call in this file. An uncaught SDK error (bad
 * credentials, Razorpay outage, an amount Razorpay itself rejects) would otherwise bubble up as
 * an opaque, undiagnosable 500 "Internal server error" — the exact symptom this wrapper exists
 * to fix (see this file's own module doc comment / the marketplace architecture plan's Razorpay
 * investigation). The real SDK error is always logged server-side (with the order/receipt it was
 * for) before a clear, customer-facing `ApiError` is thrown — never swallowed, never hidden.
 */
async function createRazorpayOrder(amountPaise: number, receipt: string) {
  try {
    return await razorpay.orders.create({ amount: amountPaise, currency: 'INR', receipt });
  } catch (err) {
    console.error({ err, context: 'razorpay.orders.create', amountPaise, receipt });
    throw new ApiError('SERVER_ERROR', 'Could not start the payment — please try again in a moment.');
  }
}

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
  const providerOrder = await createRazorpayOrder(amountPaise, order.id);

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

/**
 * Cash on Delivery — no gateway, no widget. Creates a Payment row (status CREATED, provider
 * COD — never PAID, since cash hasn't actually been collected yet) and moves the Order straight
 * to CONFIRMED in the same transaction, mirroring `verifyPayment`'s Order transition without
 * ever touching Razorpay. `providerOrderId` still needs a value (the column is @unique/required
 * for every Payment row regardless of provider) — a synthetic `cod_<orderId>` is safe to reuse
 * as the uniqueness key since a second attempt against the same order 409s below before ever
 * reaching this insert.
 */
export async function createCodPayment(customerId: string, orderId: string) {
  const order = await getMyOrderOrThrow(customerId, orderId);
  if (order.status !== 'PENDING_PAYMENT') {
    throw new ApiError('CONFLICT', `Cannot pay for an order with status ${order.status}`);
  }

  const { payment, updatedOrder } = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        orderId: order.id,
        provider: 'COD',
        providerOrderId: `cod_${order.id}`,
        amount: order.total,
        currency: 'INR',
        status: 'CREATED',
      },
    });
    const updatedOrder = await tx.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED' } });
    // Consumes the linked Booking out of the customer's "pending cart" — see
    // cascadeBookingStatus's own doc comment in order.service.ts.
    await cascadeBookingStatus(tx, updatedOrder, 'CONFIRMED');
    return { payment, updatedOrder };
  });

  return { order: updatedOrder, payment };
}

// ─── Batch (combined checkout — Deal + Therapist + Product together) ─────────
//
// One checkout action, one payment, one combined receipt — multiple Order rows under the hood
// (see the marketplace architecture plan's Phase 11 decision). `Order`/`Booking`/`Payment`'s own
// per-Order shape is unchanged; this is purely an orchestration layer that creates one Razorpay
// order for the SUM of several Orders' totals, and one Payment row per Order pointing at that
// same providerOrderId (Payment.providerOrderId is no longer globally unique — see its own
// schema doc comment).

/** Fetches and validates every order in the batch belongs to this customer and is still
 *  PENDING_PAYMENT — never assumes the frontend-supplied id list is honest. */
async function loadPayableBatch(customerId: string, orderIds: string[]) {
  if (orderIds.length === 0) throw new ApiError('VALIDATION_ERROR', 'No orders to pay for');
  const orders = await Promise.all(orderIds.map((id) => getMyOrderOrThrow(customerId, id)));
  for (const order of orders) {
    if (order.status !== 'PENDING_PAYMENT') {
      throw new ApiError('CONFLICT', `Cannot pay for an order with status ${order.status}`);
    }
  }
  return orders;
}

/**
 * Same reuse-vs-create idempotency as `createOrReusePayment`, batched: a second call before the
 * first attempt resolves returns the same `providerOrderId` (found via any one order in the
 * batch already carrying a CREATED Payment for this same set of orders) instead of minting a new
 * Razorpay order and orphaning the first attempt's Payment rows.
 */
export async function createOrReuseBatchPayment(customerId: string, orderIds: string[]) {
  const orders = await loadPayableBatch(customerId, orderIds);

  const existingForFirst = await prisma.payment.findFirst({
    where: { orderId: orders[0].id, status: 'CREATED' },
    orderBy: { createdAt: 'desc' },
  });
  if (existingForFirst) {
    // Confirm the SAME batch — every order in this request already has a CREATED Payment
    // sharing that exact providerOrderId — otherwise fall through and mint a fresh batch.
    const siblingPayments = await prisma.payment.findMany({
      where: { providerOrderId: existingForFirst.providerOrderId, status: 'CREATED' },
    });
    const siblingOrderIds = new Set(siblingPayments.map((p) => p.orderId));
    if (orders.every((o) => siblingOrderIds.has(o.id)) && siblingOrderIds.size === orders.length) {
      return {
        providerOrderId: existingForFirst.providerOrderId,
        amount: siblingPayments.reduce((sum, p) => sum.add(p.amount), new Prisma.Decimal(0)),
        currency: existingForFirst.currency,
        keyId: env.razorpayKeyId,
      };
    }
  }

  const totalAmount = orders.reduce((sum, o) => sum.add(new Prisma.Decimal(o.total)), new Prisma.Decimal(0));
  const amountPaise = Math.round(Number(totalAmount) * 100);
  const providerOrder = await createRazorpayOrder(amountPaise, orders.map((o) => o.id).join(','));

  await prisma.payment.createMany({
    data: orders.map((order) => ({
      orderId: order.id,
      providerOrderId: providerOrder.id,
      amount: order.total,
      currency: 'INR',
      status: 'CREATED' as const,
    })),
  });

  return { providerOrderId: providerOrder.id, amount: totalAmount, currency: 'INR', keyId: env.razorpayKeyId };
}

/** Same COD reasoning as `createCodPayment`, batched into one transaction — every order in the
 *  batch moves to CONFIRMED together, or none do. */
export async function createCodBatchPayment(customerId: string, orderIds: string[]) {
  const orders = await loadPayableBatch(customerId, orderIds);

  const updatedOrders = await prisma.$transaction(async (tx) => {
    const results = [];
    for (const order of orders) {
      await tx.payment.create({
        data: {
          orderId: order.id,
          provider: 'COD',
          providerOrderId: `cod_${order.id}`,
          amount: order.total,
          currency: 'INR',
          status: 'CREATED',
        },
      });
      const updatedOrder = await tx.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED' } });
      // Consumes each linked Booking out of the customer's "pending cart" — see
      // cascadeBookingStatus's own doc comment in order.service.ts.
      await cascadeBookingStatus(tx, updatedOrder, 'CONFIRMED');
      results.push(updatedOrder);
    }
    return results;
  });

  return { orders: updatedOrders };
}

/**
 * Same signature-verification discipline as `verifyPayment`, batched: verifies Razorpay's HMAC
 * ONCE against the shared providerOrderId, then marks every Payment row (and Order) in the batch
 * PAID/CONFIRMED together in one transaction. Idempotent, same as the single-order path.
 */
export async function verifyBatchPayment(customerId: string, orderIds: string[], input: VerifyPaymentInput) {
  const orders = await loadPayableBatchOrTerminal(customerId, orderIds);

  const payments = await prisma.payment.findMany({
    where: { providerOrderId: input.razorpay_order_id, orderId: { in: orderIds } },
  });
  if (payments.length !== orderIds.length) {
    throw new ApiError('NOT_FOUND', 'Payment not found for one or more orders in this batch');
  }
  if (payments.every((p) => p.status === 'PAID')) {
    return { orders };
  }

  const expectedSignature = crypto
    .createHmac('sha256', env.razorpayKeySecret)
    .update(`${input.razorpay_order_id}|${input.razorpay_payment_id}`)
    .digest('hex');

  if (expectedSignature !== input.razorpay_signature) {
    await prisma.payment.updateMany({
      where: { id: { in: payments.map((p) => p.id) } },
      data: { status: 'FAILED', failureReason: 'Signature verification failed' },
    });
    throw new ApiError('VALIDATION_ERROR', 'Payment signature verification failed');
  }

  const updatedOrders = await prisma.$transaction(async (tx) => {
    await tx.payment.updateMany({
      where: { id: { in: payments.map((p) => p.id) } },
      data: { status: 'PAID', providerPaymentId: input.razorpay_payment_id, signatureVerified: true },
    });
    const results = [];
    for (const order of orders) {
      const updatedOrder = await tx.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED' } });
      // Consumes each linked Booking out of the customer's "pending cart" — see
      // cascadeBookingStatus's own doc comment in order.service.ts.
      await cascadeBookingStatus(tx, updatedOrder, 'CONFIRMED');
      results.push(updatedOrder);
    }
    return results;
  });

  return { orders: updatedOrders };
}

/** Like `loadPayableBatch`, but tolerates orders already CONFIRMED (the idempotent-replay case
 *  in `verifyBatchPayment`, where a webhook may have already won the race for some/all orders in
 *  the batch) — only ever used there, never for minting a new Razorpay order. */
async function loadPayableBatchOrTerminal(customerId: string, orderIds: string[]) {
  if (orderIds.length === 0) throw new ApiError('VALIDATION_ERROR', 'No orders to pay for');
  return Promise.all(orderIds.map((id) => getMyOrderOrThrow(customerId, id)));
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
  const payment = await prisma.payment.findFirst({ where: { providerOrderId: input.razorpay_order_id, orderId: order.id } });
  if (!payment) {
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

  const { updatedPayment, updatedOrder } = await prisma.$transaction(async (tx) => {
    const updatedPayment = await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'PAID', providerPaymentId: input.razorpay_payment_id, signatureVerified: true },
    });
    const updatedOrder = await tx.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED' } });
    // Consumes the linked Booking out of the customer's "pending cart" — see
    // cascadeBookingStatus's own doc comment in order.service.ts.
    await cascadeBookingStatus(tx, updatedOrder, 'CONFIRMED');
    return { updatedPayment, updatedOrder };
  });

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

  // A combined checkout shares one providerOrderId across several Payment rows (one per Order
  // in the batch — see this file's `*Batch` functions) — every non-terminal row for this
  // Razorpay order must transition together, not just the first match.
  const payments = await prisma.payment.findMany({ where: { providerOrderId: entity.order_id } });
  if (payments.length === 0) return; // unknown to us — never create anything from webhook data alone
  const pending = payments.filter((p) => p.status !== 'PAID' && p.status !== 'FAILED');
  if (pending.length === 0) return; // already terminal

  if (body.event === 'payment.captured') {
    await prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { id: { in: pending.map((p) => p.id) } },
        data: { status: 'PAID', providerPaymentId: entity.id, signatureVerified: true },
      });
      const orderIds = [...new Set(pending.map((p) => p.orderId))];
      await tx.order.updateMany({ where: { id: { in: orderIds } }, data: { status: 'CONFIRMED' } });
      // Consumes each linked Booking out of the customer's "pending cart" — see
      // cascadeBookingStatus's own doc comment in order.service.ts. Re-reads the (now-updated)
      // orders since updateMany doesn't return rows.
      const updatedOrders = await tx.order.findMany({ where: { id: { in: orderIds } } });
      for (const order of updatedOrders) {
        await cascadeBookingStatus(tx, order, 'CONFIRMED');
      }
    });
  } else if (body.event === 'payment.failed') {
    await prisma.payment.updateMany({
      where: { id: { in: pending.map((p) => p.id) } },
      data: { status: 'FAILED', failureReason: entity.error_description ?? 'Payment failed', providerPaymentId: entity.id },
    });
  }
}
