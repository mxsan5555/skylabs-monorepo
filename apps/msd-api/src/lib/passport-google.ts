import passport from 'passport';
import { Strategy as GoogleStrategy, type Profile, type VerifyCallback } from 'passport-google-oauth20';
import { env } from '../env';
import { prisma } from './prisma-client';
import { UserRole } from '../generated/prisma';

// GoogleStrategy's underlying OAuth2Strategy throws synchronously if clientID
// is empty, which would crash the whole process at boot before a real Google
// OAuth client is configured (the expected default dev state). Register it
// only once real credentials exist; routes check `googleAuthConfigured` and
// respond with a clear error instead of crashing when they don't.
export const googleAuthConfigured = Boolean(env.googleClientId && env.googleClientSecret);

if (googleAuthConfigured) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.googleClientId,
        clientSecret: env.googleClientSecret,
        callbackURL: env.googleCallbackUrl,
      },
      async (_accessToken: string, _refreshToken: string, profile: Profile, done: VerifyCallback) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();

          let user = await prisma.user.findUnique({ where: { googleId: profile.id } });

          if (!user && email) {
            const byEmail = await prisma.user.findUnique({ where: { email } });
            if (byEmail) {
              user = await prisma.user.update({
                where: { id: byEmail.id },
                data: { googleId: profile.id, emailVerified: true },
              });
            }
          }

          if (!user) {
            user = await prisma.user.create({
              data: {
                googleId: profile.id,
                email,
                emailVerified: !!email,
                name: profile.displayName,
                roles: [UserRole.USER],
              },
            });
          }

          done(null, user);
        } catch (err) {
          done(err as Error);
        }
      },
    ),
  );
}

export { passport };
