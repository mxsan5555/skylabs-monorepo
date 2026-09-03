import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { razorpay } from '../lib/razorpay';
import { env } from '../config/env';
import { ApiError } from '../lib/http';
import { Prisma } from '../generated/prisma-client';
import { getMyOrderOrThrow, finalizeCartForOrder } from './order.service';

/**
 * Razorpay integration for the existing Order (Phase 8) — see the Phase 9 architecture plan.
 * `Payment` is `Order 1 -> Payment[]` (not 1:1): a retry after FAILED/CANCELLED creates a new
 * row against the SAME Order, never a new Order. Amount always comes from the server-read
 * `Order.total` — never a client-supplied number.
 */

/**
 * Constant-time comparison of two hex-encoded HMAC digests — defense-in-depth against timing
 * attacks on signature verification (`===`/`!==` short-circuits on the first differing byte,
 * leaking comparison time). Both sides are fixed-length hex by construction (same HMAC-SHA256
 * algorithm on both sides), so lengths always match in practice; `timingSafeEqual` throws on a
 * length mismatch instead of returning false, so that case is treated as "not equal" rather
 * than letting the exception escape.
 */
function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

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
    // Finalizes the linked Cart's items — see finalizeCartForOrder's own doc comment.
    await finalizeCartForOrder(tx, updatedOrder.id);
    return { payment, updatedOrder };
  });

  return { order: updatedOrder, payment };
}

// ─── Batch (combined checkout — Deal + Therapist + Product together) ─────────
//
// One checkout action, one payment, one combined receipt — multiple Order rows under the hood
// (see the marketplace architecture plan's Phase 11 decision). `Order`/`Payment`'s own per-Order
// shape is unchanged; this is purely an orchestration layer that creates one Razorpay
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
      // Finalizes each linked Cart's items — see finalizeCartForOrder.
      await finalizeCartForOrder(tx, updatedOrder.id);
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

  // If any order in this batch was already settled by a different payment attempt (e.g. COD,
  // placed while this Razorpay attempt was still open in another tab) — this whole batch payment
  // intent is stale: every order in a batch shares one Razorpay checkout, so if part of it was
  // already paid another way, the rest must not silently pile a second PAID Payment row on top.
  // Mark the still-open rows FAILED instead of letting them flip to PAID (see verifyPayment's
  // identical single-order guard for why — this is what caused a product to show twice in
  // Payment History, once per payment method).
  const stillOpen = payments.filter((p) => p.status !== 'PAID');
  if (orders.some((o) => o.status !== 'PENDING_PAYMENT')) {
    await prisma.payment.updateMany({
      where: { id: { in: stillOpen.map((p) => p.id) } },
      data: { status: 'FAILED', failureReason: 'One or more orders in this batch were already settled by a different payment' },
    });
    throw new ApiError('CONFLICT', 'One or more orders in this batch have already been settled');
  }

  const expectedSignature = crypto
    .createHmac('sha256', env.razorpayKeySecret)
    .update(`${input.razorpay_order_id}|${input.razorpay_payment_id}`)
    .digest('hex');

  if (!timingSafeEqualHex(expectedSignature, input.razorpay_signature)) {
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
      // Finalizes each linked Cart's items — see finalizeCartForOrder.
      await finalizeCartForOrder(tx, updatedOrder.id);
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
  // The order was already settled by a different payment attempt (e.g. COD placed while this
  // Razorpay attempt was still open in another tab) — this stray verification must not flip a
  // second Payment row to PAID on an already-CONFIRMED/COMPLETED order (that's exactly how the
  // same product ended up showing twice in Payment History, once per payment method).
  // `createOrReusePayment`/`createCodPayment` already guard the same way at attempt-*creation*
  // time; this is the matching guard at attempt-*verification* time.
  if (order.status !== 'PENDING_PAYMENT') {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', failureReason: `Order already settled with status ${order.status}` },
    });
    throw new ApiError('CONFLICT', `This order has already been settled (status: ${order.status})`);
  }

  const expectedSignature = crypto
    .createHmac('sha256', env.razorpayKeySecret)
    .update(`${input.razorpay_order_id}|${input.razorpay_payment_id}`)
    .digest('hex');

  if (!timingSafeEqualHex(expectedSignature, input.razorpay_signature)) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: 'Signature verification failed' } });
    throw new ApiError('VALIDATION_ERROR', 'Payment signature verification failed');
  }

  const { updatedPayment, updatedOrder } = await prisma.$transaction(async (tx) => {
    const updatedPayment = await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'PAID', providerPaymentId: input.razorpay_payment_id, signatureVerified: true },
    });
    const updatedOrder = await tx.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED' } });
    // Finalizes the linked Cart's items — see finalizeCartForOrder.
    await finalizeCartForOrder(tx, updatedOrder.id);
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
  return timingSafeEqualHex(expected, signature);
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
      // A pending Payment's Order may have already been settled by a different attempt (e.g.
      // COD, placed while this Razorpay payment was still in flight) — those must be marked
      // FAILED here, not PAID, or the order ends up with two "successful-looking" Payment rows
      // (see verifyPayment's identical guard for the interactive-callback path).
      const pendingOrderIds = [...new Set(pending.map((p) => p.orderId))];
      const relatedOrders = await tx.order.findMany({ where: { id: { in: pendingOrderIds } } });
      const statusByOrderId = new Map(relatedOrders.map((o) => [o.id, o.status]));

      const stale = pending.filter((p) => statusByOrderId.get(p.orderId) !== 'PENDING_PAYMENT');
      if (stale.length > 0) {
        await tx.payment.updateMany({
          where: { id: { in: stale.map((p) => p.id) } },
          data: { status: 'FAILED', failureReason: 'Order already settled by a different payment attempt' },
        });
      }

      const live = pending.filter((p) => statusByOrderId.get(p.orderId) === 'PENDING_PAYMENT');
      if (live.length === 0) return;

      await tx.payment.updateMany({
        where: { id: { in: live.map((p) => p.id) } },
        data: { status: 'PAID', providerPaymentId: entity.id, signatureVerified: true },
      });
      const orderIds = [...new Set(live.map((p) => p.orderId))];
      await tx.order.updateMany({ where: { id: { in: orderIds } }, data: { status: 'CONFIRMED' } });
      // Re-reads the (now-updated) orders since updateMany doesn't return rows, then finalizes
      // each linked Cart's items — see finalizeCartForOrder.
      const updatedOrders = await tx.order.findMany({ where: { id: { in: orderIds } } });
      for (const order of updatedOrders) {
        await finalizeCartForOrder(tx, order.id);
      }
    });
  } else if (body.event === 'payment.failed') {
    await prisma.payment.updateMany({
      where: { id: { in: pending.map((p) => p.id) } },
      data: { status: 'FAILED', failureReason: entity.error_description ?? 'Payment failed', providerPaymentId: entity.id },
    });
  }
}
