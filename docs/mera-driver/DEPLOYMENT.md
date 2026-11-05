# mera-driver deployment

App-specific settings. Shared steps: `docs/DEPLOYMENT.md`.

## 1. Vercel: `mera-driver` project

No environment variables. The API base is compile-time: set
`apps/mera-driver/src/environments/environment.prod.ts` to `https://<mera-driver-api-railway-domain>`
(no `/api/v1`) and commit. Output folder: `dist/apps/mera-driver/browser`.

## 2. Railway: `mera-driver-api` service

| Variable | Value | Secret |
|---|---|:-:|
| `DATABASE_URL` | Neon direct string for db `mera_driver` (separate Neon project from msd) | yes |
| `NODE_ENV` | `production` | |
| `PORT` | `3334`, equal to the domain target port | |
| `JWT_SECRET` | fresh 64-char hex, different from msd-api's | yes |
| `JWT_ACCESS_TTL_MINUTES` / `JWT_REFRESH_TTL_DAYS` | `15` / `30` | |
| `OTP_EXPIRY_MINUTES` / `OTP_MAX_ATTEMPTS` | `10` / `5` | |
| `GOOGLE_CLIENT_ID` | OAuth client id (may stay blank if Google sign-in is unused) | |
| `GOOGLE_CLIENT_SECRET` | OAuth secret | yes |
| `GOOGLE_CALLBACK_URL` | `https://<mera-driver-api-railway-domain>/auth/google/callback` (no `/api/v1`) | |
| `CORS_ORIGINS` | exact Vercel origin(s), comma-separated (plural name) | |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` | email OTP sender | |
| `SMTP_PASS` | mail password | yes |
| `EMAIL_FROM` | sender name and address | |
| `SMS_API_URL` / `SMS_SENDER` / `SMS_OTP_TEMPLATE` | SMS OTP provider, sender id, DLT template | |
| `SMS_API_KEY` | SMS provider key | yes |

No Razorpay or R2 variables yet. Uploaded driver documents are served from the API's `/uploads`
folder today; move them to object storage before relying on Railway (its disk is wiped on
redeploy).

## 3. Status

The root `TASK.md` listed the mera-driver-api deploy as pending on 2026-10-17 (task X-04).
