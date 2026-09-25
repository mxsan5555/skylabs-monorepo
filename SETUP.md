# Setup

Step-by-step deployment runbook for **Option 3**: frontends on **Vercel**, APIs on
**Railway**, databases on **Neon**, images on **Cloudflare R2**. Follow it top to
bottom in this order: **GitHub → Vercel → Railway → Cloudflare R2**.

> `DEPLOYMENT.md` is the reference (branch flow, security model, full env-var
> tables). This file is the "do these steps" guide. No real secret values appear
> here — variable *names* only.

## Topology (what you're wiring)

| Layer | msd | mera-driver | Host |
|-------|-----|-------------|------|
| Frontend (static SPA) | `apps/msd` (React+Vite) | `apps/mera-driver` (Angular) | **Vercel** (2 projects) |
| API (Express, always-on) | `apps/msd-api` (`/api/v1`) | `apps/mera-driver-api` (root) | **Railway** (2 services) |
| Database (Postgres) | db `msd` | db `mera_driver` | **Neon** (2 DBs) — created in each **Vercel** project's Storage tab |
| Image bytes | bucket `msd-media` | none yet (Phase 2) | **Cloudflare R2** |

- Browser → Vercel (static app) → calls the Railway API (`VITE_API_URL`) → Neon
  (data) + R2 (images). The browser loads images **directly** from R2's public URL.
- The **frontend never touches the database** — only the API on Railway does.

## Prerequisites (accounts, one-time)

- **GitHub** repo access.
- **Vercel** account/team, with the **Vercel GitHub app** installed on the repo.
- **Railway** account, with the **Railway GitHub app** installed on the repo.
- **Neon** databases — provisioned via each **Vercel project's Storage** tab
  (Vercel's Neon integration), one DB per API.
- **Cloudflare** account (for R2).
- **Google Cloud** project (OAuth credentials, Maps key) — optional until you need
  Google sign-in / maps.
- Enable **2FA** everywhere; restrict who can edit Production env vars.

The steps below are written for **msd**. Repeat the same pattern for **mera-driver**
with its own values (its own Vercel project, Railway service, and Neon DB; no R2 yet).

---

# Step 1 — GitHub (get code on `main`)

Both Vercel and Railway build the **`main`** branch. Nothing deploys until your code
is on `main`.

1. Push your work and open PRs through the chain:
   - `feature/*` → `develop`
   - `develop` → `release`
   - `release` → `main`
   - (A single `feature → main` PR also works if you want to move fast.)
2. **Skip `nx release` for now.** It only stamps version numbers / changelog / tags;
   it is not required to deploy. Adopt it later once the pipeline is stable.
3. Confirm `main` contains the deploy config: `apps/msd/vercel.json`,
   `apps/msd-api/railway.json`, and the updated `apps/*/project.json`.

> After this, Vercel auto-deploys on every push to `main`. Railway deploys on push
> to `main` **only if** you enable "Auto deploys" on the service (Step 3); otherwise
> you trigger it manually.

---

# Step 2 — Vercel (frontend `apps/msd` + Neon database)

## 2a. Frontend project

1. **Create the project:** Vercel → **Add New → Project** → import the GitHub repo.
2. **Root Directory:** set to **`apps/msd`** and enable **"Include files outside the
   Root Directory in the Build Step."**
3. **Framework preset:** leave as **Other / None** — `apps/msd/vercel.json` already
   defines the build:
   - build: `cd ../.. && npx nx build msd`
   - output: `../../dist/apps/msd`
   - ignored build step: `npx nx-ignore msd`
   - SPA rewrite to `/index.html`
4. **Production Branch:** `main`.
5. **Environment Variables** (Settings → Environment Variables, scope **Production +
   Preview**). These are **public** (baked into the browser bundle) — never put a
   secret here:
   - `VITE_API_URL` = `https://<your-msd-api-railway-domain>/api/v1`
     *(you get the Railway domain in Step 3 — set this now as a placeholder and come
     back, or set it after Step 3, then redeploy).*
   - `VITE_MEDIA_BASE_URL` = your R2 public URL *(from Step 4)*.
   - `VITE_GOOGLE_MAPS_API_KEY` = your Maps JS key *(Google Cloud → Maps JavaScript
     API → API key, restricted by HTTP referrer)*.
6. **Deploy.** Note your Vercel domain, e.g. `https://skylabs-msd.vercel.app`.

> ⚠️ **Vite bakes `VITE_*` at build time.** Every time you add or change one of
> these, you must **Redeploy** (Deployments → ⋮ → Redeploy). Setting a var without
> redeploying does nothing.

**mera-driver frontend** has **no** Vercel env vars — its API base is compile-time.
Edit `apps/mera-driver/src/environments/environment.prod.ts` to your mera-driver-api
Railway domain, commit, and deploy its own Vercel project.

## 2b. Neon database (Storage tab)

The Neon databases are provisioned through **Vercel's Storage integration**, not the
standalone Neon dashboard.

1. Vercel → your project (e.g. **skylabs-msd**) → **Storage** → the Neon database
   (e.g. **`msd_db`**). If it doesn't exist yet: **Create Database → Neon** (Free).
   - **Do not click "Connect."** That wires the DB into the *frontend* project, which
     never uses a database. You only need the connection string, for Railway.
2. Open the database (click its name → connection details, or "Open in Neon"). It
   shows a **pooled** string (host has `-pooler`) and a **direct / unpooled** string.
   Copy the **direct/unpooled** one for Railway (Step 3) — Prisma migrations fail over
   the pooled endpoint.
   - It ends with `?sslmode=require`; shape:
     `postgresql://<user>:<pass>@ep-xxxx.<region>.aws.neon.tech/<db>?sslmode=require`

Repeat for mera-driver under its own Vercel project's **Storage** tab (its own Neon DB).

---

# Step 3 — Railway (API: `apps/msd-api`)

One Railway **service per API**. Do the whole thing for `msd-api`, then repeat for
`mera-driver-api` with its own values. You'll paste the Neon **direct** connection
string from **Step 2b** as `DATABASE_URL`.

## 3a. Create the Railway service

1. Railway → **New Project → Deploy from GitHub repo** → this repo.
2. **Rename the service** to `msd-api` (so its generated domain is clear).
3. **Root Directory:** leave **empty** (repo root). Do **not** set it to `apps/msd-api`.
4. **Settings → Build → Custom Build Command:**
   ```
   npm ci && npx nx build msd-api
   ```
5. **Settings → Deploy → Custom Start Command:**
   ```
   node dist/apps/msd-api/main.js
   ```
6. **Settings → Deploy → Pre-deploy Command** (applies DB migrations each deploy):
   ```
   node node_modules/prisma/build/index.js migrate deploy --schema=apps/msd-api/prisma/schema.prisma
   ```
   *(Alternative to 4–6: Settings → Config-as-code → point at
   `apps/msd-api/railway.json`, which contains all of the above.)*

## 3b. Variables

Settings → **Variables**. The essentials (full list in `DEPLOYMENT.md` §8.3):

- `DATABASE_URL` = the Neon **direct** string from **Step 2b**.
- `NODE_ENV` = `production`.
- `PORT` = `3333` (must match the domain target port in 3c).
- `JWT_SECRET` = a fresh 64-char hex — generate with `openssl rand -hex 32`.
- `CORS_ORIGIN` = your **real** Vercel domain, e.g. `https://skylabs-msd.vercel.app`.
  - **Scheme + host only. No trailing slash, no `/api/v1`, no `<placeholder>` text.**
    It must exactly equal the browser's `Origin`. Comma-separate multiple domains.
- `SUPERADMIN_PHONE`, `GOOGLE_*`, `SMTP_*`, `SMS_*`, `RAZORPAY_*`, `R2_*` — add as you
  enable each feature (see `DEPLOYMENT.md` §8.3). The API boots without the optional
  ones; those features just won't work until filled.

## 3c. Networking (domain + port)

1. Settings → **Networking → Generate Domain**.
2. Set the **target port to `3333`** — it must equal the `PORT` variable so the app
   binds the port Railway routes to. (A 502 means these don't match.)
3. Your API base is the domain **+ `/api/v1`**, e.g.
   `https://skylabs-monorepo-production.up.railway.app/api/v1`. Put that in Vercel's
   `VITE_API_URL` (Step 2) and **redeploy Vercel**.

## 3d. Deploy + first-run database notes

1. Deploy (turn on **Auto deploys when pushed to GitHub** so future `main` pushes
   redeploy, or trigger manually).
2. **If the pre-deploy fails with `P3009` (failed migration in the DB):** an earlier
   attempt left a failed migration recorded. Fix it once, from your machine, against
   the Neon **direct** URL:
   - DB is disposable (fresh setup) → reset and re-apply all migrations:
     ```
     DATABASE_URL="<neon-direct>" node node_modules/prisma/build/index.js migrate reset --schema=apps/msd-api/prisma/schema.prisma --force --skip-seed
     ```
   - DB has data to keep → mark the failed one rolled-back, then redeploy:
     ```
     DATABASE_URL="<neon-direct>" node node_modules/prisma/build/index.js migrate resolve --rolled-back <migration_name> --schema=apps/msd-api/prisma/schema.prisma
     ```
3. **Seed roles + SuperAdmin once** (set the Neon direct URL, `JWT_SECRET`, and
   `SUPERADMIN_PHONE` in `apps/msd-api/.env.local`, then):
   ```
   npm run msd-api:prisma:seed
   ```

## 3e. Verify the API

- `https://<railway-domain>/api/v1/health` → `{"data":{"status":"ok","app":"msd-api"}…}`.
- `https://<railway-domain>/docs` → Swagger lists all routes.
- Note: hitting the bare `https://<railway-domain>/api/v1` returns a `NOT_FOUND`
  envelope — that's expected (no route at the base path), not an error.

---

# Step 4 — Cloudflare R2 (images for msd)

Uploads go through the API (server-side); the browser only **reads** images from the
public URL, so **no bucket CORS config is needed**.

## 4a. Create the bucket

1. Cloudflare → **R2 Object Storage** (enable R2 if first time; 10 GB free, no egress
   fees).
2. **Create bucket** → name **`msd-media`** → Create.

## 4b. Enable the public URL

1. Open `msd-media` → **Settings → Public Development URL → Enable**.
2. Copy the URL, e.g. `https://pub-<hash>.r2.dev` → this is `VITE_MEDIA_BASE_URL`.
   *(Without this, images 404 in the browser.)*

## 4c. Get the Account ID

- On the R2 overview page, copy your **Account ID** → `R2_ACCOUNT_ID`.
  *(The API's S3 endpoint is `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`.)*

## 4d. Create the API token

1. R2 → **Manage R2 API Tokens → Create Account API token** (Account, not User — it
   stays valid regardless of individual user membership).
2. Name `msd-api-r2`; permission **Object Read & Write**; **Apply to specific buckets
   only → `msd-media`**; create.
3. Copy (shown once): **Access Key ID** → `R2_ACCESS_KEY_ID`,
   **Secret Access Key** → `R2_SECRET_ACCESS_KEY`.

## 4e. Add the vars

- **Railway (msd-api → Variables):** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET=msd-media` → save (redeploys).
- **Vercel (msd → Environment Variables):** `VITE_MEDIA_BASE_URL` = the r2.dev URL
  (no trailing slash) → **redeploy** msd.

## 4f. Verify

1. Sign in to the admin console, **upload a Deal/Product image**.
2. Cloudflare → `msd-media` → **Objects**: a file appears (e.g. `deals/<id>/<uuid>.jpg`).
3. The image displays on the site, and **still loads after a Railway redeploy**
   (proves it's on R2, not the ephemeral container disk).

---

# Final verification (end-to-end)

- API: `/api/v1/health` = ok, `/docs` loads.
- Frontend `https://skylabs-msd.vercel.app` loads with correct layout and **data**.
- Browser DevTools (F12) → Network: API calls hit `…railway.app/api/v1/…` and return
  **200**, with **no CORS errors** in Console.
- Sign in (OTP / Google), open `/account`, data loads.
- Image upload appears in R2 and survives a Railway redeploy.

## Common trip-ups (from real setup)

- **No data / CORS errors** → `CORS_ORIGIN` on Railway isn't your exact Vercel domain
  (no `<placeholder>`, no trailing slash), or `VITE_API_URL` wasn't set **before** the
  Vercel build (redeploy after setting it).
- **502 on the API** → `PORT` variable ≠ the domain's target port.
- **Pre-deploy `P3009`** → a prior failed migration in Neon; reset or resolve (3d).
- **Pre-deploy can't reach DB** → `DATABASE_URL` is the localhost placeholder or the
  `-pooler` endpoint; use the Neon **direct** string with `?sslmode=require`.
- **Images 404** → R2 public URL not enabled (4b), or `VITE_MEDIA_BASE_URL` set but
  Vercel not redeployed.

---

# Appendix — Local development

Prereqs: **Node 20**, npm, local **PostgreSQL** (or a Neon dev branch).

```bash
npm ci
# copy each template and fill it (git-ignored):
#   apps/msd/.env.local, apps/msd-api/.env.local, apps/mera-driver-api/.env.local
#   (mera-driver frontend has no env file — uses environment.ts)

# Prisma per API (pinned scripts, never bare `npx prisma`):
npm run msd-api:prisma:generate && npm run msd-api:prisma:migrate && npm run msd-api:prisma:seed
npm run mera-driver-api:prisma:generate && npm run mera-driver-api:prisma:migrate && npm run mera-driver-api:prisma:seed

# run all four:
npx nx serve msd                 # http://localhost:4200
npx nx run mera-driver:serve     # http://localhost:4400
npx nx serve msd-api             # http://localhost:3333/api/v1  (docs at /docs)
npx nx serve mera-driver-api     # http://localhost:3334         (docs at /docs)
```

**How to get each secret value** (`DATABASE_URL`, `JWT_SECRET`, Google OAuth, Gmail
app password, ConnectExpress SMS, Razorpay, R2, Maps key): see the table in
`DEPLOYMENT.md` §8 and the provider notes there.
