import { Router } from 'express';
import type { Request } from 'express';
import { authenticate } from '../middleware/authenticate';
import { validateBody } from '../middleware/validate';
import { HttpError } from '../middleware/errorHandler';
import { OtpRequestSchema, OtpVerifySchema, RefreshRequestSchema, LogoutRequestSchema } from '../schemas/auth.schema';
import { requestOtp, verifyOtp } from '../services/otp.service';
import {
  upsertUserByIdentifier,
  upsertUserFromGoogle,
  getRoleKeysForUser,
  recordLoginHistory,
  touchLastLogin,
  loginMethodForIdentifier,
} from '../services/auth.service';
import { issueTokenPair, rotateRefreshToken, revokeRefreshToken, revokeAllSessionsForUser } from '../services/token.service';
import { passport } from '../lib/passport';

const router = Router();

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

function toPublicUser(user: { id: string; name: string; email: string | null; phone: string | null }, roles: string[]) {
  return { id: user.id, name: user.name, email: user.email, phone: user.phone, roles };
}

// POST /auth/otp/request — same response whether or not the identifier belongs to a real
// user, so this endpoint can never be used to enumerate accounts.
router.post('/otp/request', validateBody(OtpRequestSchema), async (req, res, next) => {
  try {
    const { identifier, purpose } = req.body as { identifier: string; purpose: 'login' | 'signup' | 'change_phone' | 'change_email' };
    await requestOtp(identifier, purpose);
    res.json({ data: { message: 'If the identifier is valid, an OTP has been sent.' }, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /auth/otp/verify — verifies the OTP, upserts the user, issues a JWT pair.
router.post('/otp/verify', validateBody(OtpVerifySchema), async (req, res, next) => {
  const { identifier, otp, purpose } = req.body as {
    identifier: string;
    otp: string;
    purpose: 'login' | 'signup' | 'change_phone' | 'change_email';
  };
  const method = loginMethodForIdentifier(identifier);

  try {
    await verifyOtp(identifier, purpose, otp);
    const user = await upsertUserByIdentifier(identifier);
    const roles = await getRoleKeysForUser(user.id);
    const tokens = await issueTokenPair(user.id, roles, requestMeta(req));

    await touchLastLogin(user.id);
    await recordLoginHistory(user.id, method, true, requestMeta(req));

    res.json({ data: { ...tokens, user: toPublicUser(user, roles) }, error: null });
  } catch (err) {
    if (err instanceof HttpError) {
      const existing = await upsertUserByIdentifier(identifier).catch(() => null);
      if (existing) {
        await recordLoginHistory(existing.id, method, false, requestMeta(req)).catch(() => undefined);
      }
    }
    next(err);
  }
});

// GET /auth/google — redirect to Google's consent screen.
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

// GET /auth/google/callback — upsert the user from the verified profile, issue a JWT pair.
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/auth/google/failure' }),
  async (req, res, next) => {
    try {
      const profile = req.user as unknown as {
        id: string;
        displayName: string;
        emails?: { value: string }[];
      };
      const email = profile.emails?.[0]?.value;
      if (!email) {
        throw new HttpError(422, 'VALIDATION_ERROR', 'Google account has no verified email');
      }

      const user = await upsertUserFromGoogle({ googleId: profile.id, email, name: profile.displayName ?? email });
      const roles = await getRoleKeysForUser(user.id);
      const tokens = await issueTokenPair(user.id, roles, requestMeta(req));

      await touchLastLogin(user.id);
      await recordLoginHistory(user.id, 'google', true, requestMeta(req));

      res.json({ data: { ...tokens, user: toPublicUser(user, roles) }, error: null });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/google/failure', (_req, res) => {
  res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Google sign-in failed' } });
});

// POST /auth/refresh — rotates the opaque refresh token; replay of an already-used token
// revokes the whole session chain for that user.
router.post('/refresh', validateBody(RefreshRequestSchema), async (req, res, next) => {
  try {
    const { refreshToken } = req.body as { refreshToken: string };
    const tokens = await rotateRefreshToken(refreshToken, requestMeta(req));
    res.json({ data: tokens, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /auth/logout — revokes a single refresh session (this device only).
router.post('/logout', validateBody(LogoutRequestSchema), async (req, res, next) => {
  try {
    const { refreshToken } = req.body as { refreshToken: string };
    await revokeRefreshToken(refreshToken);
    res.json({ data: { message: 'Logged out' }, error: null });
  } catch (err) {
    next(err);
  }
});

// POST /auth/logout-all — revokes every active refresh session for the caller.
router.post('/logout-all', authenticate, async (req, res, next) => {
  try {
    await revokeAllSessionsForUser(req.user!.sub);
    res.json({ data: { message: 'Logged out of all devices' }, error: null });
  } catch (err) {
    next(err);
  }
});

export default router;
