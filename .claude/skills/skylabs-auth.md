# Skill: Skylabs Auth

In-house authentication for msd-api and mera-driver-api. No Supabase or Firebase — JWT issued by our own Express servers.

## Auth Methods
1. Phone OTP — send 6-digit code via SMS, verify to issue JWT
2. Email OTP — same flow via email
3. Google OAuth — passport-google-oauth20 → callback → issue JWT

## JWT Strategy
- **Access token**: signed with `JWT_SECRET`, 15-minute TTL
- **Refresh token**: signed with `JWT_REFRESH_SECRET`, 7-day TTL, stored in httpOnly cookie or DB
- Payload: `{ sub: userId, roles: UserRole[], iat, exp }`
- Never put PII (name, email, phone) in the token payload

## OTP Flow

### Send OTP
```ts
// POST /auth/otp/send
// Body: { phone?: string, email?: string }
// 1. Generate 6-digit OTP: crypto.randomInt(100000, 999999).toString()
// 2. Hash it: await bcrypt.hash(otp, 10)
// 3. Store in DB: { userId or identifier, hashedOtp, expiresAt: now + 10 min }
// 4. Send via SMS/email service
// 5. Return: { data: { message: 'OTP sent' } }
```

### Verify OTP
```ts
// POST /auth/otp/verify
// Body: { phone?: string, email?: string, otp: string }
// 1. Fetch stored hash from DB where identifier matches and expiresAt > now
// 2. await bcrypt.compare(otp, hashedOtp)
// 3. If match: delete OTP record, upsert user, issue JWT pair
// 4. Return: { data: { accessToken, user: { id, roles } } }
```

## Google OAuth Flow
```ts
// Uses passport-google-oauth20
// GET /auth/google → redirects to Google consent screen
// GET /auth/google/callback → receives profile, upserts user, issues JWT pair
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/auth/google/callback',
}, async (accessToken, refreshToken, profile, done) => {
  const user = await upsertUserFromGoogle(profile);
  return done(null, user);
}));
```

## Auth Middleware (Express)
```ts
// middleware/auth.ts
import jwt from 'jsonwebtoken';

export function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No token' } });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
  }
}
```

## Role Middleware (Express)
```ts
// middleware/role.ts
export function requireRole(...roles: string[]) {
  return (req, res, next) => {
    if (!req.user?.roles?.some(r => roles.includes(r))) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient role' } });
    }
    next();
  };
}

// Usage on a route:
router.get('/admin/deals', authenticate, requireRole('admin'), dealsController.list);
```

## Frontend Token Handling

### msd (React)
- Store: `localStorage.setItem('msd_auth_token', token)`
- Read: `localStorage.getItem('msd_auth_token')`
- Roles: `JSON.parse(localStorage.getItem('msd_auth_roles') || '[]')`
- Clear on logout: remove both keys

### mera-driver (Angular)
- Store: `localStorage.setItem('mera_auth_token', token)`
- Read: via `auth.service.ts` signal
- Interceptor in `core/auth/auth.interceptor.ts` auto-attaches the Bearer token

## Dev Mock Auth (temporary — remove when real backend is ready)
Both apps currently mock auth via localStorage. The sidebar "View as (demo)" switcher changes the stored roles. To test a specific role: open DevTools → Application → Local Storage → set `msd_auth_roles` to `["admin"]`.

## Environment Variables
```
# Both APIs
JWT_SECRET=<random 64-char string>
JWT_REFRESH_SECRET=<different random 64-char string>
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
OTP_EXPIRY_MINUTES=10

# SMS/Email OTP service
OTP_SMS_PROVIDER_KEY=
OTP_EMAIL_FROM=noreply@skylabs.in
```
Never commit these. Add to `.env.local` locally, CI/CD secrets in production.
