import Razorpay from 'razorpay';
import { env } from '../config/env';

/** Singleton client, same pattern as `lib/prisma.ts` — one place to construct it, so tests can
 *  `vi.mock('../lib/razorpay', ...)` at the module boundary instead of hitting the real API. */
export const razorpay = new Razorpay({
  key_id: env.razorpayKeyId,
  key_secret: env.razorpayKeySecret,
});
