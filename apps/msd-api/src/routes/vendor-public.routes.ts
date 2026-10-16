import { Router } from 'express';
import { vendorPublicRegisterRateLimiter } from '../middleware/rateLimiter';
import { ApiError } from '../lib/http';

/**
 * Public "Become a Vendor" registration is closed: staff create every member (decision D9).
 * The route stays, unauthenticated and rate limited, so the `/become-vendor` page gets a clear
 * 403 with a "contact our team" message instead of a 404. It never reads the body and never
 * creates a User or a Member.
 */
const router = Router();

router.post('/register', vendorPublicRegisterRateLimiter, async (_req, _res, next) => {
  next(
    new ApiError(
      'FORBIDDEN',
      'Member accounts are created by our team. Please contact us and we will set up your account.',
    ),
  );
});

export default router;
