# 01 — Auth (Login, OTP, OAuth, Sessions)

In-house auth (no Supabase): phone/email OTP + Google OAuth, issuing JWTs.
Matches the existing frontend flow: sign-in page → OTP page → account console.

## Entities

### OtpChallenge

| Field | Type | Required | Default | Description | Example |
|-------|------|----------|---------|-------------|---------|
| `id` | uuid | ✔ | | Challenge id, returned to client | |
| `identifier` | string | ✔ | | E.164 phone or lowercased email | `+919812345678` |
| `channel` | enum | ✔ | | `sms \| email` | |
| `codeHash` | string | ✔ | | Hashed 6-digit code — never stored plain | |
| `purpose` | enum | ✔ | | `login \| signup \| change_phone \| change_email \| partner_signup` | |
| `attempts` | int | ✔ | 0 | Max 5 verify attempts | |
| `expiresAt` | timestamp | ✔ | +10 min | | |
| `consumedAt` | timestamp | | null | Set on successful verify | |

### RefreshSession

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | uuid | ✔ | Session id |
| `userId` | uuid | ✔ | FK → User |
| `tokenHash` | string | ✔ | Hashed refresh token (rotated on every use) |
| `deviceLabel` | string | | e.g. `"Chrome on Windows"` (parsed from UA) |
| `ip` | string | | Last-seen IP |
| `lastUsedAt` | timestamp | ✔ | |
| `expiresAt` | timestamp | ✔ | +30 days, sliding |
| `revokedAt` | timestamp | | Set on logout / "sign out everywhere" |

## Token model

- **Access token**: JWT, 15 min TTL, payload `{ sub, roles, iat, exp }`. Stateless.
- **Refresh token**: opaque random string, 30 days, stored hashed, **rotated on every
  refresh** (old one revoked — replay detection revokes the whole session).
- Frontend stores tokens in `localStorage` (`msd_auth_token`) today; keep, but document
  the XSS trade-off. Roles come from the JWT — the `msd_auth_roles` key and the demo
  role switcher are removed at integration.

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/auth/otp/request` | public | Send OTP to phone or email |
| POST | `/auth/otp/verify` | public | Verify code → tokens (creates User on first login) |
| GET | `/auth/google` | public | Redirect to Google consent (passport-google-oauth20) |
| GET | `/auth/google/callback` | public | OAuth callback → tokens (link by verified email) |
| POST | `/auth/refresh` | public (refresh token) | Rotate refresh, new access token |
| POST | `/auth/logout` | user | Revoke current session |
| POST | `/auth/logout-all` | user | Revoke all sessions for the user |
| GET | `/auth/sessions` | user | List active sessions (device, IP, last used) |
| DELETE | `/auth/sessions/:id` | user | Revoke one session |

### POST /auth/otp/request

```json
// request
{ "identifier": "+919812345678", "channel": "sms", "purpose": "login" }
// 200
{ "challengeId": "018f...", "expiresAt": "2026-07-14T09:40:00Z", "resendAfterSeconds": 30 }
```

Errors: `429 OTP_RATE_LIMITED` (5 per 10 min per identifier), `422` invalid identifier.
Response is identical whether or not the identifier has an account (no user enumeration).

### POST /auth/otp/verify

```json
// request
{ "challengeId": "018f...", "code": "482913" }
// 200
{
  "accessToken": "eyJ...",
  "refreshToken": "8f3k...",
  "user": { "id": "018f...", "name": null, "phone": "+919812345678", "email": null, "roles": ["user"], "isNew": true }
}
```

Errors: `401 OTP_INVALID`, `401 OTP_EXPIRED`, `429 OTP_TOO_MANY_ATTEMPTS`.
`isNew: true` → frontend routes to profile completion.

### Partner signup

Same OTP flow with `purpose: "partner_signup"`; on verify the user is created with
roles `["user", "partner"]` and the frontend routes into company onboarding
(see 03-companies). An existing consumer can upgrade via `POST /partners/apply` (03).

## Zod schemas

`OtpRequestSchema`, `OtpVerifySchema`, `AuthTokensResponseSchema`,
`SessionResponseSchema`, `RefreshRequestSchema`.

## Open questions

- [ ] SMS provider (MSG91 / Twilio) and email (Resend free tier per stack defaults) — pick before build.
- [ ] Move refresh token to httpOnly cookie instead of localStorage? Safer, needs CORS + CSRF design.
- [ ] Should Google sign-in be allowed to *create* accounts, or only link to OTP-verified ones?
