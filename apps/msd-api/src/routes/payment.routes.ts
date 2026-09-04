import { Router } from 'express';
import type { Request } from 'express';
import { verifyWebhookSignature, handleWebhookEvent } from '../services/payment.service';
import { sendData, sendError } from '../lib/http';

/**
 * Razorpay webhook — deliberately its own router with NO `authenticate` (Razorpay itself is
 * the caller, not a logged-in user); trust comes entirely from the HMAC signature check below,
 * matching Razorpay's documented webhook verification mechanism. Mirrors `catalog.routes.ts`'s
 * precedent of an unauthenticated router for a different, legitimate reason.
 */
const router = Router();

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

router.post('/webhook/razorpay', async (req: RequestWithRawBody, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    if (typeof signature !== 'string' || !req.rawBody || !verifyWebhookSignature(req.rawBody, signature)) {
      sendError(res, 'UNAUTHORIZED', 'Invalid webhook signature');
      return;
    }
    await handleWebhookEvent(req.body);
    // Razorpay retries on any non-2xx — always ack once the signature is valid and the event
    // has been processed (or safely no-op'd as already-terminal/unknown).
    sendData(res, { received: true });
  } catch (err) {
    next(err);
  }
});

export default router;
