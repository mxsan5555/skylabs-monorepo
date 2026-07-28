import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { env } from '../../env';
import { passport, googleAuthConfigured } from '../../lib/passport-google';
import { otpIpRateLimit } from '../../middleware/rate-limit';
import { otpRequestSchema, otpVerifySchema, exchangeRequestSchema } from './auth.schemas';
import {
  requestLoginOtp,
  verifyLoginOtp,
  startGoogleExchange,
  exchangeCodeForToken,
} from './auth.service';

export const authRouter = Router();

authRouter.post('/otp/request', otpIpRateLimit, async (req, res, next) => {
  try {
    const input = otpRequestSchema.parse(req.body);
    const result = await requestLoginOtp(input);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/otp/verify', otpIpRateLimit, async (req, res, next) => {
  try {
    const input = otpVerifySchema.parse(req.body);
    const result = await verifyLoginOtp(input);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

function requireGoogleConfigured(_req: Request, res: Response, next: NextFunction): void {
  if (!googleAuthConfigured) {
    res.status(503).json({ error: 'google_auth_not_configured' });
    return;
  }
  next();
}

authRouter.get(
  '/google',
  requireGoogleConfigured,
  passport.authenticate('google', { session: false, scope: ['profile', 'email'] }),
);

authRouter.get(
  '/google/callback',
  requireGoogleConfigured,
  passport.authenticate('google', { session: false, failureRedirect: `${env.frontendUrl}/sign-in` }),
  async (req, res, next) => {
    try {
      const code = await startGoogleExchange(req.user!);
      res.redirect(`${env.frontendUrl}/auth/callback?code=${encodeURIComponent(code)}`);
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post('/exchange', async (req, res, next) => {
  try {
    const { code } = exchangeRequestSchema.parse(req.body);
    const result = await exchangeCodeForToken(code);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
