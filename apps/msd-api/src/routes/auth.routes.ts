import { Router } from 'express';
import { passport } from '../lib/passport';
import { authenticate } from '../middleware/authenticate';
import { validateBody } from '../middleware/validate';
import { otpRequestRateLimiter } from '../middleware/rateLimiter';
import { OtpRequestSchema, OtpVerifySchema, RefreshRequestSchema } from '../schemas/auth.schema';
import { requestOtp, verifyOtp } from '../services/otp.service';
import { loginWithIdentifier } from '../services/auth.service';
import { normalizeIdentifier } from '../lib/normalizeIdentifier';
import { rotateRefreshToken, revokeRefreshToken, revokeAllRefreshTokens } from '../services/token.service';
import { signAccessToken } from '../lib/jwt';
import { sendData } from '../lib/http';

const router = Router();

function requestMeta(req: import('express').Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

router.post('/otp/request', otpRequestRateLimiter, validateBody(OtpRequestSchema), async (req, res, next) => {
  try {
    const { purpose } = req.body as { identifier: string; purpose: 'login' | 'signup' | 'change_phone' | 'change_email' };
    const identifier = normalizeIdentifier(req.body.identifier as string);
    await requestOtp(identifier, purpose);
    // Same response whether or not the identifier has an account — no user enumeration.
    sendData(res, { message: 'OTP sent if the identifier is valid' });
  } catch (err) {
    next(err);
  }
});

router.post('/otp/verify', validateBody(OtpVerifySchema), async (req, res, next) => {
  try {
    const { otp } = req.body as { identifier: string; otp: string };
    const identifier = normalizeIdentifier(req.body.identifier as string);
    await verifyOtp(identifier, otp);
    const result = await loginWithIdentifier(identifier, requestMeta(req));
    sendData(res, result);
  } catch (err) {
    next(err);
  }
});

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/api/v1/auth/google/failure' }),
  (req, res) => {
    // passport attaches the value returned by the strategy's `done(null, value)` to req.user;
    // lib/passport.ts casts the login result (accessToken/refreshToken/user) through
    // Express.User to get it here — cast it back to its real shape.
    const result = req.user as unknown as Awaited<ReturnType<typeof loginWithIdentifier>>;
    sendData(res, result);
  },
);

router.get('/google/failure', (_req, res) => {
  sendData(res, null, { status: 401 });
});

router.post('/refresh', validateBody(RefreshRequestSchema), async (req, res, next) => {
  try {
    const { refreshToken } = req.body as { refreshToken: string };
    const rotated = await rotateRefreshToken(refreshToken, requestMeta(req));
    const accessToken = signAccessToken({ sub: rotated.userId, roles: rotated.roles, app: 'msd' });
    sendData(res, { accessToken, refreshToken: rotated.token });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', authenticate, validateBody(RefreshRequestSchema), async (req, res, next) => {
  try {
    const { refreshToken } = req.body as { refreshToken: string };
    await revokeRefreshToken(refreshToken);
    sendData(res, { message: 'Logged out' });
  } catch (err) {
    next(err);
  }
});

router.post('/logout-all', authenticate, async (req, res, next) => {
  try {
    await revokeAllRefreshTokens(req.user!.sub);
    sendData(res, { message: 'All sessions revoked' });
  } catch (err) {
    next(err);
  }
});

export default router;
