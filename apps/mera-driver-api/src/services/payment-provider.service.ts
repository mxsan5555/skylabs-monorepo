import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';
import { recordMovement } from './accounts.service';

function config() {
  const key = process.env.RAZORPAY_KEY_ID, secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key || !secret) throw new HttpError(503, 'PAYMENT_UNCONFIGURED', 'Payment gateway credentials are not configured. Contact support for offline payment.');
  return { key, secret };
}
async function provider(path: string, method = 'GET', body?: unknown) {
  const { key, secret } = config();
  let response: Response;
  try { response = await fetch(`https://api.razorpay.com/v1/${path}`, { method, signal: AbortSignal.timeout(10000), headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
  catch { throw new HttpError(502, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Payment provider timed out or is unavailable. Do not retry a charged payment; contact support to reconcile it.'); }
  if (!response.ok) throw new HttpError(502, response.status<500?'PAYMENT_PROVIDER_REJECTED':'PAYMENT_PROVIDER_UNAVAILABLE', `Payment provider rejected the request (HTTP ${response.status}).`);
  try { return await response.json(); } catch { throw new HttpError(502, 'PAYMENT_PROVIDER_INVALID', 'Payment provider returned an unreadable response'); }
}
export async function createPayment(userId: string, owner: { customerId?: string; driverId?: string }, bookingId?: string) {
  const { key } = config();
  const intent = await prisma.$transaction(async tx => {
    let amountPaise: number, kind: string;
    if (owner.customerId) {
      if (!bookingId) throw new HttpError(422, 'BOOKING_REQUIRED', 'Choose a booking');
      await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`;
      const booking = await tx.booking.findFirst({ where: { id: bookingId, customerId: owner.customerId } });
      if (!booking) throw new HttpError(404, 'NOT_FOUND', 'Booking not found');
      if (!booking.farePaise || booking.status === 'cancelled') throw new HttpError(422, 'PAYMENT_INVALID', 'Booking cannot be paid online');
      const movements = await tx.moneyMovement.findMany({ where: { bookingId } });
      amountPaise = booking.farePaise - movements.reduce((s,m) => s + (m.kind === 'booking_payment' ? m.amountPaise : m.kind === 'booking_refund' ? -m.amountPaise : 0), 0); kind = 'booking_payment';
    } else {
      if (!owner.driverId) throw new HttpError(403, 'OWNERSHIP_REQUIRED', 'A linked portal record is required');
      await tx.$queryRaw`SELECT "id" FROM "Driver" WHERE "id" = ${owner.driverId} FOR UPDATE`;
      const driver = await tx.driver.findUniqueOrThrow({ where: { id: owner.driverId } });
      const movements = await tx.moneyMovement.findMany({ where: { driverId: driver.id, kind: { startsWith: 'registration_' } } });
      if (movements.some(m => m.kind === 'registration_waiver')) throw new HttpError(422, 'FEE_WAIVED', 'Registration fee has been waived');
      amountPaise = driver.registrationFeePaise - movements.reduce((s,m) => s + (m.kind === 'registration_payment' ? m.amountPaise : m.kind === 'registration_refund' ? -m.amountPaise : 0), 0); kind = 'registration_payment';
    }
    if (amountPaise <= 0) throw new HttpError(422, 'ALREADY_SETTLED', 'No outstanding payment is due');
    const previous = await tx.paymentIntent.findFirst({ where: { ...(bookingId ? { bookingId } : { driverId: owner.driverId }), status: { in: ['processing','pending'] } }, orderBy: { createdAt: 'desc' } });
    if (previous) {
      if (!previous.providerOrderId || previous.amountPaise !== amountPaise) throw new HttpError(409, 'PAYMENT_RECONCILIATION_REQUIRED', 'A payment is already processing. Contact support before retrying.');
      return previous;
    }
    if (owner.customerId) await tx.booking.update({where:{id:bookingId},data:{paymentMode:'razorpay'}});
    return tx.paymentIntent.create({ data: { userId, bookingId: owner.customerId ? bookingId : undefined, driverId: owner.driverId, amountPaise, kind, status: 'processing' } });
  });
  if (intent.providerOrderId) return { intentId: intent.id, orderId: intent.providerOrderId, amountPaise: intent.amountPaise, keyId: key };
  try {
    const order = z.object({ id: z.string().regex(/^order_[A-Za-z0-9]+$/), amount: z.number().int(), currency: z.literal('INR') }).parse(await provider('orders', 'POST', { amount: intent.amountPaise, currency: 'INR', receipt: intent.id }));
    if (order.amount !== intent.amountPaise) throw new HttpError(502, 'PAYMENT_AMOUNT_MISMATCH', 'Provider order amount does not match');
    await prisma.paymentIntent.update({ where: { id: intent.id }, data: { status: 'pending', providerOrderId: order.id } });
    return { intentId: intent.id, orderId: order.id, amountPaise: intent.amountPaise, keyId: key };
  } catch (error) {
    // An uncertain order creation must not be retried automatically.
    await prisma.paymentIntent.update({ where: { id: intent.id }, data: { ...(error instanceof HttpError&&error.code==='PAYMENT_PROVIDER_REJECTED'?{status:'failed'}:{}), failureReason: error instanceof HttpError ? error.code : 'UNKNOWN_RESPONSE' } });
    throw error instanceof HttpError ? error : new HttpError(502, 'PAYMENT_PROVIDER_INVALID', 'Provider order requires manual reconciliation');
  }
}
const paymentSchema = z.object({ id: z.string().regex(/^pay_[A-Za-z0-9]+$/), order_id: z.string(), amount: z.number().int().positive(), currency: z.literal('INR'), status: z.literal('captured'), captured: z.literal(true), method: z.string() });
export async function settleCapturedPayment(raw: unknown) {
  const parsed = paymentSchema.safeParse(raw);
  if (!parsed.success) throw new HttpError(422, 'PAYMENT_UNCONFIRMED', 'Only a matching captured INR payment may be settled');
  const payment = parsed.data;
  const intent = await prisma.paymentIntent.findUnique({ where: { providerOrderId: payment.order_id } });
  if (!intent || intent.amountPaise !== payment.amount) throw new HttpError(422, 'PAYMENT_ORDER_MISMATCH', 'Payment does not match a saved order and amount');
  const movement = await recordMovement(intent.userId, { reference: `razorpay:${payment.id}`, bookingId: intent.bookingId ?? undefined, driverId: intent.driverId ?? undefined,
    kind: intent.kind, amountPaise: payment.amount, method: `razorpay:${payment.method}`, reason: 'Captured provider payment verified on backend' }, true);
  await prisma.paymentIntent.update({ where: { id: intent.id }, data: { status: 'paid', failureReason: null } });
  return movement;
}
export async function confirmPayment(userId: string, paymentId: string, orderId: string, signature: string) {
  const intent = await prisma.paymentIntent.findFirst({ where: { providerOrderId: orderId, userId } });
  if (!intent) throw new HttpError(404, 'NOT_FOUND', 'Payment not found');
  const {secret}=config();
  const expected=createHmac('sha256',secret).update(`${intent.providerOrderId}|${paymentId}`).digest();
  if (!/^[a-f0-9]{64}$/i.test(signature) || !timingSafeEqual(expected,Buffer.from(signature,'hex'))) throw new HttpError(401,'PAYMENT_SIGNATURE_INVALID','Invalid payment signature');
  const payment = await provider(`payments/${encodeURIComponent(paymentId)}`);
  const parsed = paymentSchema.safeParse(payment);
  if (!parsed.success) throw new HttpError(422, 'PAYMENT_UNCONFIRMED', 'Payment is not captured');
  if(parsed.data.order_id!==intent.providerOrderId)throw new HttpError(422,'PAYMENT_ORDER_MISMATCH','Payment does not match the saved order');
  return settleCapturedPayment(payment);
}
export function verifyWebhook(body: Buffer, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(503, 'PAYMENT_WEBHOOK_UNCONFIGURED', 'Webhook secret is not configured');
  if (!/^[a-f0-9]{64}$/i.test(signature)) throw new HttpError(401, 'WEBHOOK_SIGNATURE_INVALID', 'Invalid webhook signature');
  const expected = createHmac('sha256', secret).update(body).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw new HttpError(401, 'WEBHOOK_SIGNATURE_INVALID', 'Invalid webhook signature');
}
export async function receiveWebhook(body: Buffer, signature: string) {
  verifyWebhook(body, signature);
  let event: { event?: string; payload?: { payment?: { entity?: unknown } } };
  try { event = JSON.parse(body.toString('utf8')); } catch { throw new HttpError(422, 'WEBHOOK_INVALID', 'Unreadable webhook'); }
  if (event.event === 'payment.captured') await settleCapturedPayment(event.payload?.payment?.entity);
  if (event.event === 'payment.failed') {
    const failed = z.object({ order_id: z.string(), status: z.literal('failed') }).safeParse(event.payload?.payment?.entity);
    if (failed.success) await prisma.paymentIntent.updateMany({ where: { providerOrderId: failed.data.order_id, status: 'pending' }, data: { status: 'failed', failureReason: 'PROVIDER_PAYMENT_FAILED' } });
  }
  return { received: true };
}
