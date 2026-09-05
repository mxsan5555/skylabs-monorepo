import passport from 'passport';
import { Strategy as GoogleStrategy, type Profile } from 'passport-google-oauth20';

const clientID = process.env.GOOGLE_CLIENT_ID ?? '';
const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';
const callbackURL = process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:3334/auth/google/callback';

if (clientID && clientSecret) {
  passport.use(
    new GoogleStrategy(
      { clientID, clientSecret, callbackURL },
      (_accessToken: string, _refreshToken: string, profile: Profile, done) => {
        // Business upsert happens in the route handler (services/auth.service.ts) — this
        // strategy callback only forwards the verified Google profile. `Express.User` is
        // shaped like our JWT payload (see types/express.d.ts) for the *authenticated*
        // case, but mid-OAuth-handshake `req.user` is genuinely a passport `Profile` —
        // the callback route reads it back out with its own cast.
        done(null, profile as unknown as Express.User);
      },
    ),
  );
} else if (process.env.NODE_ENV !== 'test') {
  console.warn('[passport] GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set — /auth/google routes will 500 if used.');
}

export { passport };
