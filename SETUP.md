# Setup

From-zero bootstrap of the whole monorepo: local development first, then the cloud
setup for **Option 3** (Vercel + Railway + Neon + Cloudflare R2), including the
**move from a personal Vercel account to the corporate Vercel Team**.

> This is the one-time onboarding runbook. For how deploys work day to day (branch
> → environment, the security model, the full env-var reference), see
> **`DEPLOYMENT.md`** — this file links into it rather than repeating it. No secret
> value appears here: variable *names* only.

## 0. What you're standing up

| Layer | msd | mera-driver | Host | Cost |
|-------|-----|-------------|------|------|
| Frontend (static SPA) | `apps/msd` (React+Vite) | `apps/mera-driver` (Angular) | **Vercel** (2 projects) | free |
| API (Express) | `apps/msd-api` | `apps/mera-driver-api` | **Railway** (2 services) | ~$5–10/mo |
| Database | db `msd` | db `mera_driver` | **Neon** (2 DBs) | free |
| Image bytes | `msd-media` | `mera-driver-media` | **Cloudflare R2** (2 buckets) | free |

---

## 1. Accounts & access (corporate)

- **Corporate Vercel Team** — join it (a member with deploy rights). Do **not** use
  a personal account for project work.
- **GitHub app installs, scoped to this repo only:** install the **Vercel GitHub
  app** and the **Railway GitHub app** on the **corporate GitHub org** (least
  privilege — grant only this repo).
- **Railway** (team), **Neon** (for 2 DBs), **Cloudflare** (for R2), and a **Google
  Cloud** project (OAuth credentials).
- **Enable 2FA** on every corporate account. Restrict who can edit **Production**
  env vars on Vercel and Railway.

---

## 2. Local development (do this first — fastest feedback)

Prereqs: **Node 20**, npm, and local **PostgreSQL** (or a Neon dev branch).

```bash
git clone <repo> && cd skylabs-monorepo
npm ci
```

**Env files** — copy each `.env.example` to `.env.local` and fill it (these are
git-ignored; never commit them):

- `apps/msd/.env.local`
- `apps/msd-api/.env.local`
- `apps/mera-driver-api/.env.local`

> The **mera-driver frontend** has no env file — its API base is compile-time in
> `apps/mera-driver/src/environments/environment.ts`.

**Prisma per API** (each API owns its own schema/DB — never shared). Use the pinned
`npm run` scripts, never bare `npx prisma` (that pulls Prisma 7, which errors on
this schema):

```bash
# msd-api (db "msd")
npm run msd-api:prisma:generate
npm run msd-api:prisma:migrate
npm run msd-api:prisma:seed

# mera-driver-api (db "mera_driver")
npm run mera-driver-api:prisma:generate
npm run mera-driver-api:prisma:migrate
npm run mera-driver-api:prisma:seed
```

> `prisma:generate` also runs automatically as part of `nx build`, so you never
> ship a stale client. You only run it by hand here to get types before first serve.

**Run all four apps:**

```bash
npx nx serve msd                 # http://localhost:4200
npx nx run mera-driver:serve     # http://localhost:4400
npx nx serve msd-api             # http://localhost:3333/api/v1  (docs at /docs, health at /api/v1/health)
npx nx serve mera-driver-api     # http://localhost:3334         (docs at /docs, health at /health)
```

**Verify local:** both frontends load, both `/docs` render, and OTP / Google
sign-in works against your local DB.

### Variables & secrets: how to get each value

Your `.env.local` files list the variable *names*; here's where each **value**
comes from. For the full "which variable goes in which service" tables (Vercel /
Railway msd-api / Railway mera-driver-api / R2), see **`DEPLOYMENT.md` §8**.

| Value | Where to get / how to generate |
|---|---|
| **`DATABASE_URL`** | Neon (neon.tech) → your project → Connection Details → copy the **direct** string (the one *without* `-pooler`), e.g. `postgresql://user:pass@ep-xxx.neon.tech/db?sslmode=require`. One Neon project per API (`msd`, `mera_driver`). |
| **`JWT_SECRET`** | Generate fresh: `openssl rand -hex 32` (or `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). Use a **different** value per API and per environment. |
| **`GOOGLE_CLIENT_ID` / `_SECRET`** | Google Cloud Console → APIs & Services → Credentials → Create Credentials → **OAuth client ID** → **Web application**. |
| **`GOOGLE_CALLBACK_URL`** | Your Railway API domain + the callback path (msd-api: `/api/v1/auth/google/callback`; mera-driver-api: `/auth/google/callback`). Add the *same* URL under the OAuth client's **Authorized redirect URIs**. |
| **`SMTP_USER` / `SMTP_PASS`** (Gmail) | Enable 2-Step Verification → Google Account → Security → **App passwords** → generate. `SMTP_USER` = the Gmail address, `SMTP_PASS` = the 16-char app password. |
| **`SMS_API_KEY` / `SMS_SENDER`** | connectexpress.in account → API key from the API section; `SMS_SENDER` = your approved DLT sender ID. |
| **`RAZORPAY_KEY_ID` / `_SECRET`** | Razorpay Dashboard → Settings → API Keys (Test keys for dev/preview, Live for production). |
| **`RAZORPAY_WEBHOOK_SECRET`** | Razorpay Dashboard → Settings → Webhooks → add webhook → copy its signing secret. |
| **`R2_*` + public URL** | Cloudflare R2 (see `DEPLOYMENT.md` §6): Account ID, a bucket-scoped Object Read/Write token (access key + secret), bucket name, and the r2.dev public URL → `VITE_MEDIA_BASE_URL`. |
| **`VITE_GOOGLE_MAPS_API_KEY`** | Google Cloud Console → enable **Maps JavaScript API** → create an API key → **restrict by HTTP referrer** to your Vercel domain. |
| **`SUPERADMIN_PHONE`** | A phone number you control; the seed creates the first SuperAdmin with it. |
| **`VITE_API_URL`** | `https://<msd-api-railway-domain>/api/v1` (after the Railway domain exists). |
| **`CORS_ORIGIN` / `CORS_ORIGINS`** | Your Vercel frontend domain(s), comma-separated. `CORS_ORIGIN` on msd-api, `CORS_ORIGINS` (plural) on mera-driver-api. |

Fixed (non-secret) values — set them verbatim: `NODE_ENV=production` (cloud),
`JWT_ACCESS_TTL_MINUTES=15`, `JWT_REFRESH_TTL_DAYS=30`, `OTP_EXPIRY_MINUTES=10`,
`OTP_MAX_ATTEMPTS=5`, `OTP_REQUEST_RATE_LIMIT_PER_10_MIN=5`, `SMTP_HOST=smtp.gmail.com`,
`SMTP_PORT=587`, `SMTP_SECURE=false`, `SMS_API_URL=https://connectexpress.in/api/v3/`,
`R2_BUCKET=msd-media`. On Railway, set **`PORT`** to match the domain's target port
(`3333` msd-api / `3334` mera-driver-api) so the app binds the port Railway routes to.

---

## 3. Cloud setup — do it in this order

Some values reference each other (the Vercel domain ↔ CORS, the Railway domain ↔
`VITE_API_URL` + Google callback), so follow this sequence. Detailed steps are in
`DEPLOYMENT.md` §5 (Railway), §6 (R2), §8 (variable tables); the Vercel/connect
steps are §4–§5 below.

1. **Neon** — create both databases (`msd`, `mera_driver`), copy each **direct**
   `DATABASE_URL`.
2. **R2** — create the `msd-media` bucket, enable its public URL, mint a
   bucket-scoped Object Read/Write token (yields the `R2_*` values + public URL).
3. **Railway** — deploy both API services from the repo (Root Directory = repo root;
   each reads its committed `apps/<api>/railway.json`). Set every Variable you have
   so far; leave `CORS_ORIGIN(S)` and `GOOGLE_CALLBACK_URL` as placeholders. Then
   **Generate a domain** for each service.
4. **Google Cloud** — create the OAuth client(s), add the two redirect URIs (now
   that Railway domains exist), and set `GOOGLE_CALLBACK_URL` on Railway.
5. **Vercel** — create both projects (§4). On **msd** set `VITE_API_URL`,
   `VITE_MEDIA_BASE_URL`, `VITE_GOOGLE_MAPS_API_KEY`; for **mera-driver** edit
   `environment.prod.ts`. Deploy → note the Vercel domains.
6. **Railway again** — set `CORS_ORIGIN` (msd-api) and `CORS_ORIGINS`
   (mera-driver-api) to the Vercel domains; redeploy the APIs.
7. **Redeploy msd on Vercel** so Vite bakes the final `VITE_*` values.

---

## 4. Corporate Vercel Team + move off the personal account

Do a **fresh import** into the corporate team (cleaner than transferring the old
projects).

1. **Corporate Vercel Team → Add New → Project →** import this GitHub repo
   (authorize the corporate Vercel GitHub app on the org first).
2. Create **two** projects (don't add api project) following **`DEPLOYMENT.md` §4**:
   - **msd** — Root Directory `apps/msd`
   - **mera-driver** — Root Directory `apps/mera-driver`

   The committed `apps/<app>/vercel.json` supplies build/output/ignore. Set
   **Production Branch = `main`** and enable "Include files outside the Root
   Directory."
3. **Env vars per project** (§7 / §8 in DEPLOYMENT.md): `VITE_API_URL`,
   `VITE_MEDIA_BASE_URL`, and msd's `VITE_GOOGLE_MAPS_API_KEY`, scoped **Production
   vs Preview**. Deploy a **preview first** to validate the `../..` relative paths.

### Custom-domain cutover (the delicate part)

A domain can be attached to only **one** Vercel project/team at a time, so cut over
deliberately, in a low-traffic window:

1. Validate the new **corporate** project on its `*.vercel.app` URL.
2. **Old personal project → Settings → Domains → remove** the domain.
3. **New corporate project → Domains → add** the domain → Vercel re-verifies.
   DNS already points at Vercel, so this is usually near-instant; for an apex domain
   confirm the A/ALIAS/CNAME records Vercel shows at the registrar.
4. Repeat per app if each app has its own domain.

### Decommission the personal setup

- Once the corporate project serves production **and** the domain, **remove the
  personal project's Git connection (or delete the project)** — otherwise two Vercel
  projects watch the same repo and both deploy on every push.
- **Neon is unaffected by the Vercel move.** In Option 3 the database is read by the
  **API on Railway** via `DATABASE_URL`, not by Vercel. Any Neon↔personal-Vercel
  storage link was cosmetic. Optionally transfer the Neon project to a corporate
  Neon org later — not required for cutover.
- **Rotate every secret** carried over from the personal setup (fresh `JWT_SECRET`,
  new provider keys), and confirm all secrets now live in the corporate Vercel Team
  env store + Railway Variables — never a personal account.

---

## 5. Connect, secure, first deploy

- **Connect the three tiers:** `DEPLOYMENT.md` §7 (set `VITE_*`, the CORS allowlist,
  and the Google OAuth redirect URI).
- **Security checklist:** `DEPLOYMENT.md` §1 (secrets only in host env + `.env.local`;
  frontend gets public values only; least-privilege R2 token + strict CORS).
- **Verify end-to-end:** `DEPLOYMENT.md` §11 (health, docs, sign-in, image upload
  survives a Railway redeploy, no CORS errors).

## 6. Ongoing work

Branch flow, back-merge discipline, versioning (`nx release`), and the CI gate all
live in **`DEPLOYMENT.md` §2, §9, §10**. Always branch new work off `develop`.
