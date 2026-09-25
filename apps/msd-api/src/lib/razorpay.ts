import Razorpay from 'razorpay';
import { env } from '../config/env';

/** Lazy singleton, same test-boundary role as `lib/prisma.ts`. Razorpay's constructor throws when
 *  `key_id` is empty, so building the client at import time crashes the whole API at boot whenever
 *  RAZORPAY_* isn't set (local dev, or any deploy that doesn't use payments). We defer construction
 *  to first property access instead — mirroring `lib/media-storage`'s lazy S3 client — so importing
 *  this module never requires Razorpay configured. Call sites keep using `razorpay.orders.create(...)`;
 *  tests still `vi.mock('../lib/razorpay', ...)` at the module boundary. */
let client: Razorpay | undefined;

function getClient(): Razorpay {
  if (!client) {
    if (!env.razorpayKeyId || !env.razorpayKeySecret) {
      throw new Error(
        'Razorpay is not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to use payments.',
      );
    }
    client = new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
  }
  return client;
}

export const razorpay = new Proxy({} as Razorpay, {
  get(_target, prop) {
    const value = (getClient() as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(getClient()) : value;
  },
});
