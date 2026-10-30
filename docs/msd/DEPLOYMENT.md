# msd deployment

App-specific deploy settings for `apps/msd` (Vercel) and `apps/msd-api` (Railway). Shared steps
(topology, security model, branch flow, Railway and R2 setup, verification, local dev):
`docs/DEPLOYMENT.md`.

## 1. Vercel: `msd` project (all values public)

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://<msd-api-railway-domain>/api/v1` |
| `VITE_MEDIA_BASE_URL` | R2 public URL, `https://pub-<hash>.r2.dev`, no trailing slash |
| `VITE_SITE_URL` | website origin (not the API), e.g. `https://www.myspadeal.in`; empty until the custom domain is live, which omits canonicals, Open Graph, most JSON-LD and the crawler files |
| `VITE_MAP_PROVIDER` | `leaflet` (default, OpenStreetMap, no key) or `google` |
| `VITE_MAP_TILE_URL`, `VITE_MAP_TILE_ATTRIBUTION` | optional Leaflet tile source; attribution must stay visible |
| `VITE_GOOGLE_MAPS_API_KEY` | only for `VITE_MAP_PROVIDER=google`; restrict by HTTP referrer |
| `PRERENDER_API_URL` | optional, build time only; defaults to `VITE_API_URL` |
| `PRERENDER_TIMEOUT_MS` | optional, build time only; default 15000 per data load |
| `PRERENDER_ALLOW_EMPTY` | build time only; `1` lets a production build ship without prerendered pages when the API is down |

The build runs `npx nx run msd:prerender`, which fetches catalog data from the API. A Vercel
production build fails when the API is unreachable or no route rendered (so production never
silently ships the bare SPA); preview and local builds fall back to the SPA. Redeploy after every
`VITE_*` change.

## 2. Railway: `msd-api` service

🔒 = secret (Railway Variables or local `.env.local` only).

| Variable | Value | |
|---|---|:-:|
| `DATABASE_URL` | Neon direct string for db `msd` | 🔒 |
| `NODE_ENV` | `production` | |
| `PORT` | `3333`, equal to the domain target port | |
| `JWT_SECRET` | fresh 64-char hex (`openssl rand -hex 32`), distinct per environment | 🔒 |
| `JWT_ACCESS_TTL_MINUTES` / `JWT_REFRESH_TTL_DAYS` | `15` / `30` | |
| `OTP_EXPIRY_MINUTES` / `OTP_MAX_ATTEMPTS` / `OTP_REQUEST_RATE_LIMIT_PER_10_MIN` | `10` / `5` / `5` | |
| `OTP_IDENTIFIER_RATE_LIMIT_PER_HOUR` | `10` (OTP sends per phone or email per hour, any IP) | |
| `TRUST_PROXY_HOPS` | `1` on Railway (one proxy); leave unset locally | |
| `API_DOCS` | unset (Swagger `/docs` off in production); `true` only to open it temporarily | |
| `REQUEST_LOGGING` | unset (one JSON line per request, with `X-Request-Id`); `false` to silence | |
| `DEV_OTP_IDENTIFIERS` | **never set** on Railway (local test accounts only; production refuses to boot with it) | |
| `CORS_ORIGIN` | exact Vercel origins, comma-separated | |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth client id / secret | 🔒 (secret) |
| `GOOGLE_CALLBACK_URL` | `https://<msd-api-railway-domain>/api/v1/auth/google/callback` | |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` | e.g. `smtp.gmail.com` / `587` / `false` / Gmail address | |
| `SMTP_PASS` | Gmail app password | 🔒 |
| `EMAIL_FROM` | `Massage Deals <no-reply@yourdomain>` | |
| `SMS_API_URL` / `SMS_SENDER` | `https://connectexpress.in/api/v3/` / approved DLT sender id | |
| `SMS_API_KEY` | ConnectExpress key | 🔒 |
| `RAZORPAY_KEY_ID` | Razorpay key id | |
| `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | Razorpay secrets | 🔒 |
| `R2_ACCOUNT_ID` / `R2_BUCKET` | Cloudflare account id / `msd-media` | |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | R2 token | 🔒 |
| `R2_PUBLIC_URL` | optional public URL of the bucket | |
| `R2_PRIVATE_BUCKET` | `msd-private` (public access off); member documents. Uploads return 503 until set | |
| `SUPPORT_EMAIL` / `SUPPORT_PHONE` | support contact printed in member and order notices | |
| `PUBLIC_SITE_URL` | storefront origin for links in customer emails (default: the first `CORS_ORIGIN`) | |
| `SMS_DLT_TEMPLATE_ORDER_CONFIRMED` / `SMS_DLT_TEMPLATE_PAYMENT_FAILED` | DLT template ids; an order SMS goes out only when its id is set (D38), email always goes | |
| `FIELD_ENCRYPTION_KEY` | 32 random bytes, base64; encrypts full Aadhaar and PAN numbers | 🔒 |
| `DOC_HASH_PEPPER` | secret for the document number duplicate hash | 🔒 |
| `CRON_SECRET` | 64-char hex; the same value goes on the cron service | 🔒 |

`SUPERADMIN_PHONE` (or `SUPERADMIN_EMAIL`) is read only by the seed script, from `.env.local`.
SMTP, SMS, Razorpay and R2 are checked on first use, so the API boots without them; that feature
just fails until its group is filled.

**Production boot check (P2-09).** With `NODE_ENV=production` the API refuses to start, naming
each problem (never a value), when `JWT_SECRET` is under 32 characters, `CORS_ORIGIN` is empty or
contains `*`, `FIELD_ENCRYPTION_KEY` is missing or not 32 bytes of base64, or `R2_PRIVATE_BUCKET`,
`DOC_HASH_PEPPER` or `CRON_SECRET` is missing (`src/config/env-checks.ts`). Set all six on
Railway **before** deploying a build that contains this check, or the deploy will not boot.

## 3. Scheduled job: member document reminders

Daily at **10:00 IST (04:30 UTC)** a Railway cron service calls the API, which sends due
reminders, retries failed channels and sets "Ready for suspension review" (rules:
`PLANNING.md` §2.4; design: `ARCHITECTURE.md` §2.3).

1. Set `CRON_SECRET` on `msd-api`.
2. New Railway service in the same project → Settings → Cron Schedule `30 4 * * *` (Railway cron
   runs in UTC), variables `CRON_SECRET` (same value) and `API_URL`
   (`https://<msd-api-railway-domain>`).
3. Start command:
   `curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" "$API_URL/api/v1/internal/jobs/document-reminders"`.
   `-f` makes a non-2xx response exit non-zero, so Railway marks the run failed; turn on failure
   notifications for the service (task P6-07).
4. Running it twice is safe: each reminder is one database row, claimed before sending.

## 4. Release checklist for the member release

- [ ] DLT-approved SMS templates for the welcome, suspension, reactivation and 3 reminder texts in
      `apps/msd-api/src/lib/member-messages.ts` (P10-43).
- [ ] `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `FIELD_ENCRYPTION_KEY`, `DOC_HASH_PEPPER`, `CRON_SECRET`
      set on staging and production (P10-44).
- [ ] `apps/msd-api/prisma/member-status-report.ts` run on a Neon copy, owner sign-off on the
      counts, migration up and down rehearsed (P10-45); then `20261015100000_member_lifecycle` and
      `20261017100000_member_document_reminders` go out with the API deploy.
- [ ] Cron service created and a manual run returns the summary (P6-07).

## 5. Release order and checks

- **API first, then frontend** whenever the frontend calls a new endpoint or parameter (example:
  the category filter panel needed `GET /catalog/deals/facets` and new sort and filter params; an
  old API returned empty facets and 422 on the new sorts).
- After deploy, besides `docs/DEPLOYMENT.md` §9: `/category/<slug>` shows the filter panel with
  Business and Branches counts, price sort reorders cards, and the map shows OpenStreetMap tiles
  with visible attribution (or Google Maps when switched).
- **Map tiles:** `tile.openstreetmap.org` allows normal interactive use only (attribution visible,
  no bulk prefetching, access can be withdrawn for heavy commercial traffic). Move
  `VITE_MAP_TILE_URL` to a free-tier provider before traffic grows (task ST-27).
