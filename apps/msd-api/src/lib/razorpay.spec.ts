import crypto from 'node:crypto';
import { describe, it, expect, beforeAll } from 'vitest';

// env.ts requires DATABASE_URL/JWT_SECRET/FRONTEND_URL at import time (via required()),
// and lib/razorpay.ts imports env — so tests need .env.local loaded first, same as the
// running app. dotenv.config() below is a no-op if envs are already present.
import * as dotenv from 'dotenv';
dotenv.config({ path: 'apps/msd-api/.env.local' });

describe('lib/razorpay signature verification', () => {
  let verifyCheckoutSignature: typeof import('./razorpay').verifyCheckoutSignature;
  let verifyWebhookSignature: typeof import('./razorpay').verifyWebhookSignature;

  beforeAll(async () => {
    ({ verifyCheckoutSignature, verifyWebhookSignature } = await import('./razorpay'));
  });

  describe('verifyCheckoutSignature', () => {
    it('accepts a signature computed the same way Razorpay computes it', () => {
      const secret = process.env.RAZORPAY_KEY_SECRET!;
      const orderId = 'order_test123';
      const paymentId = 'pay_test456';
      const signature = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');

      expect(verifyCheckoutSignature(orderId, paymentId, signature)).toBe(true);
    });

    it('rejects a tampered signature', () => {
      const secret = process.env.RAZORPAY_KEY_SECRET!;
      const signature = crypto.createHmac('sha256', secret).update('order_test123|pay_test456').digest('hex');

      // Same signature, but for a different payment id — must not verify.
      expect(verifyCheckoutSignature('order_test123', 'pay_DIFFERENT', signature)).toBe(false);
    });

    it('rejects a signature signed with the wrong secret', () => {
      const signature = crypto.createHmac('sha256', 'not-the-real-secret').update('order_test123|pay_test456').digest('hex');

      expect(verifyCheckoutSignature('order_test123', 'pay_test456', signature)).toBe(false);
    });

    it('rejects garbage input without throwing', () => {
      expect(verifyCheckoutSignature('order_test123', 'pay_test456', 'not-a-hex-signature')).toBe(false);
    });
  });

  describe('verifyWebhookSignature', () => {
    it('accepts a signature computed over the exact raw body', () => {
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;
      const body = JSON.stringify({ event: 'payment.captured', payload: {} });
      const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

      expect(verifyWebhookSignature(body, signature)).toBe(true);
    });

    it('rejects when the body changes after signing (tamper detection)', () => {
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;
      const original = JSON.stringify({ event: 'payment.captured', amount: 100 });
      const signature = crypto.createHmac('sha256', secret).update(original).digest('hex');
      const tampered = JSON.stringify({ event: 'payment.captured', amount: 999999 });

      expect(verifyWebhookSignature(tampered, signature)).toBe(false);
    });

    it('rejects a signature from a different secret', () => {
      const body = JSON.stringify({ event: 'payment.failed' });
      const signature = crypto.createHmac('sha256', 'wrong-secret').update(body).digest('hex');

      expect(verifyWebhookSignature(body, signature)).toBe(false);
    });
  });
});
