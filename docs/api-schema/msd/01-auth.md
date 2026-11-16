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
- The SPA keeps only the access token in `localStorage`; the refresh token is an **HttpOnly,
  Secure-in-production cookie** scoped to the auth endpoints. JavaScript cannot read or persist
  the refresh token.
- Cookie-authenticated refresh and logout requests send `X-CSRF-Token`. The SPA obtains the
  token from `GET /auth/csrf`; the API verifies it against the CSRF cookie. The endpoint is
  origin-restricted by the configured CORS allowlist.
- A `Login As` preview token is scoped to the current tab and never replaces the real access
  token or uses the refresh session.
- Roles come from the JWT — the `msd_auth_roles` key and the demo role switcher are removed
  at integration.

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/auth/otp/request` | public | Send OTP to phone or email |
| POST | `/auth/otp/verify` | public | Verify code → tokens (creates User on first login) |
| GET | `/auth/google` | public | Redirect to Google consent (passport-google-oauth20) |
| GET | `/auth/google/callback` | public | OAuth callback → tokens (link by verified email) |
| GET | `/auth/csrf` | public | Return the CSRF value paired with the auth cookie |
| POST | `/auth/refresh` | refresh cookie + CSRF header | Rotate refresh cookie, return new access token |
| POST | `/auth/logout` | refresh cookie + CSRF header | Revoke current session and clear auth cookies |
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
  "user": { "id": "018f...", "name": null, "phone": "+919812345678", "email": null, "roles": ["user"], "isNew": true }
}
```

Errors: `401 OTP_INVALID`, `401 OTP_EXPIRED`, `429 OTP_TOO_MANY_ATTEMPTS`.
The response also sets the refresh and CSRF cookies. The refresh token is not present in the
JSON body. `isNew: true` → frontend routes to profile completion.

### Cookie deployment requirements

- The browser client sends credentials only to the API URL configured for the app; the API must
  allow that exact origin with credentialed CORS.
- Production cookies use `SameSite=None; Secure` for cross-origin API calls. When the frontend
  and API are on different sites, browsers that block third-party cookies may prevent refresh;
  use a same-site API domain or same-origin proxy for reliable persistent sessions.
- Cookie lifetime follows `JWT_REFRESH_TTL_DAYS`; no refresh lifetime or domain is embedded in
  frontend code.
- Deploy the API and frontend together. Existing browser-stored refresh tokens cannot be
  converted to the HttpOnly cookie, so users may need to sign in again after this rollout.

### Partner signup

Same OTP flow with `purpose: "partner_signup"`; on verify the user is created with
roles `["user", "partner"]` and the frontend routes into company onboarding
(see 03-companies). An existing consumer can upgrade via `POST /partners/apply` (03).

## Zod schemas

`OtpRequestSchema`, `OtpVerifySchema`, `AuthTokensResponseSchema`,
`SessionResponseSchema`, `RefreshRequestSchema`.

## Open questions

- [ ] SMS provider (MSG91 / Twilio) and email (Resend free tier per stack defaults) — pick before build.
- [ ] Should Google sign-in be allowed to *create* accounts, or only link to OTP-verified ones?
