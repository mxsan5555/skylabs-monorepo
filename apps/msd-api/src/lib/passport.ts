import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { env } from '../config/env';
import { loginWithGoogle } from '../services/auth.service';

export function configurePassport(): void {
  if (!env.googleClientId || !env.googleClientSecret) {
    // Google OAuth env vars not set — /auth/google routes will 500 if hit, but the rest of
    // the API (OTP auth, RBAC) works fine without them. Documented in .env.example.
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: env.googleClientId,
        clientSecret: env.googleClientSecret,
        callbackURL: env.googleCallbackUrl,
      },
      (_accessToken, _refreshToken, profile, done) => {
        const email = profile.emails?.[0]?.value;
        if (!email) {
          // `done(null, false, info)` is a clean auth failure — Passport resolves it via the
          // route's existing `failureRedirect` (401-equivalent). `done(err, ...)` (the previous
          // behavior) is treated as a genuine server error and bypasses failureRedirect entirely,
          // hitting the generic 500 branch instead.
          done(null, false, { message: 'Google account has no verified email.' });
          return;
        }
        // The strategy's `done(err, user)` types `user` as `Express.User` (our JWT
        // AccessTokenPayload shape elsewhere), but here we need the full token+profile
        // result to flow through to the callback route — hence the deliberate cast.
        loginWithGoogle(profile.id, email, profile.displayName ?? email)
          .then((result) => done(null, result as unknown as Express.User))
          .catch(done);
      },
    ),
  );
}

export { passport };
