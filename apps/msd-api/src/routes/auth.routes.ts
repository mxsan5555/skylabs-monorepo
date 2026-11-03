import { Router } from 'express';
import { passport } from '../lib/passport';
import { authenticate } from '../middleware/authenticate';
import { validateBody } from '../middleware/validate';
import {
  otpDummyIdentifierVerifyRateLimiter,
  otpDummyVerifyRateLimiter,
  otpIdentifierRateLimiter,
  otpRequestRateLimiter,
} from '../middleware/rateLimiter';
import { OtpRequestSchema, OtpVerifySchema } from '../schemas/auth.schema';
import { requestOtp, verifyOtp } from '../services/otp.service';
import { loginWithIdentifier } from '../services/auth.service';
import { normalizeIdentifier } from '../lib/normalizeIdentifier';
import { rotateRefreshToken, revokeRefreshToken, revokeAllRefreshTokens } from '../services/token.service';
import { signAccessToken } from '../lib/jwt';
import { sendData, sendError, ApiError } from '../lib/http';
import { prisma } from '../lib/prisma';
import { getMemberAccessState } from '../services/member-access.service';
import { suspendedMessage } from '../lib/member-messages';
import { setAuthCookies, clearAuthCookies, readRefreshCookie, requireCsrfHeader } from '../lib/auth-cookies';

const router = Router();

function requestMeta(req: import('express').Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

/** Same bar `authenticate.ts`/`auth.service.ts#assertUserMayLogIn` already enforce at request
 *  time and at login — re-checked here too so a suspended/deactivated account can't silently
 *  regain a working access token through a refresh it's still technically able to call (the
 *  refresh route runs before `authenticate`, since it has no access token to verify yet). */
async function assertRefreshedUserMayContinue(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true, deletedAt: true } });
  if (!user || user.deletedAt || user.status !== 'active') {
    throw new ApiError('FORBIDDEN', 'This account has been disabled. Please contact support.');
  }
  const access = await getMemberAccessState(userId);
  if (access.kind === 'blocked') {
    throw new ApiError('MEMBER_SUSPENDED', suspendedMessage(access.reason));
  }
}

router.post('/otp/request', otpRequestRateLimiter, otpIdentifierRateLimiter, validateBody(OtpRequestSchema), async (req, res, next) => {
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

router.post(
  '/otp/verify',
  otpDummyVerifyRateLimiter,
  otpDummyIdentifierVerifyRateLimiter,
  validateBody(OtpVerifySchema),
  async (req, res, next) => {
  try {
    const { otp } = req.body as { identifier: string; otp: string };
    const identifier = normalizeIdentifier(req.body.identifier as string);
    await verifyOtp(identifier, otp);
    const { refreshToken, ...result } = await loginWithIdentifier(identifier, requestMeta(req));
    setAuthCookies(res, refreshToken);
    sendData(res, result);
  } catch (err) {
    next(err);
  }
  },
);

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/api/v1/auth/google/failure' }),
  (req, res) => {
    // passport attaches the value returned by the strategy's `done(null, value)` to req.user;
    // lib/passport.ts casts the login result (accessToken/refreshToken/user) through
    // Express.User to get it here — cast it back to its real shape.
    const { refreshToken, ...result } = req.user as unknown as Awaited<ReturnType<typeof loginWithIdentifier>>;
    setAuthCookies(res, refreshToken);
    sendData(res, result);
  },
);

router.get('/google/failure', (_req, res) => {
  sendData(res, null, { status: 401 });
});

router.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken = readRefreshCookie(req);
    if (!refreshToken) {
      sendError(res, 'UNAUTHORIZED', 'No refresh session');
      return;
    }
    // Checked only after validating the request carries SOME CSRF-cookie-paired header — a
    // request with no cookies at all (never logged in) gets the plain "no session" 401 above,
    // not a CSRF rejection, so this stays silent/no-op for a visitor who was never signed in.
    if (!requireCsrfHeader(req)) {
      sendError(res, 'FORBIDDEN', 'Missing or invalid CSRF token');
      return;
    }
    const rotated = await rotateRefreshToken(refreshToken, requestMeta(req));
    try {
      await assertRefreshedUserMayContinue(rotated.userId);
    } catch (err) {
      // The session we just rotated to is for a now-blocked account — don't leave it live.
      await revokeAllRefreshTokens(rotated.userId);
      clearAuthCookies(res);
      throw err;
    }
    const accessToken = signAccessToken({ sub: rotated.userId, roles: rotated.roles, app: 'msd' });
    setAuthCookies(res, rotated.token);
    sendData(res, { accessToken });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const refreshToken = readRefreshCookie(req);
    if (refreshToken) await revokeRefreshToken(refreshToken);
    clearAuthCookies(res);
    sendData(res, { message: 'Logged out' });
  } catch (err) {
    next(err);
  }
});

router.post('/logout-all', authenticate, async (req, res, next) => {
  try {
    await revokeAllRefreshTokens(req.user!.sub);
    clearAuthCookies(res);
    sendData(res, { message: 'All sessions revoked' });
  } catch (err) {
    next(err);
  }
});

export default router;
