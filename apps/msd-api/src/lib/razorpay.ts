import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { env } from '../env';

export const razorpayConfigured = !!(env.razorpayKeyId && env.razorpayKeySecret);

let client: Razorpay | null = null;
function getClient(): Razorpay {
  if (!client) client = new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
  return client;
}

/** amountPaise is already in paise — Razorpay's `amount` param is paise for INR too. */
export async function createRazorpayOrder(amountPaise: number, receipt: string) {
  return getClient().orders.create({ amount: amountPaise, currency: 'INR', receipt });
}

export async function fetchRazorpayPayment(paymentId: string) {
  return getClient().payments.fetch(paymentId);
}

function hmacHex(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/** Verifies the client-side checkout success payload: order_id|payment_id signed with the key secret. */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  const expected = hmacHex(`${orderId}|${paymentId}`, env.razorpayKeySecret);
  return timingSafeEqual(expected, signature);
}

/** Verifies a webhook payload against RAZORPAY_WEBHOOK_SECRET (separate secret, configured in the dashboard). */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const expected = hmacHex(rawBody, env.razorpayWebhookSecret);
  return timingSafeEqual(expected, signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
