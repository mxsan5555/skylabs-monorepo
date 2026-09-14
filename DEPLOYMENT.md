# Deployment

How this monorepo ships in **Option 3**: the two **frontends** on **Vercel**, the
two **Express APIs** on **Railway**, each API's Postgres on **Neon**, and uploaded
images on **Cloudflare R2**. This is the **source of truth**; `README.md`,
`SETUP.md`, `CLAUDE.md`, `PLANNING.md`, and `TASK.md` link here rather than repeat it.

> New to the project / setting it up from zero (incl. moving to the corporate
> Vercel team)? Start with **`SETUP.md`**, which walks the full bootstrap and links
> back here for the deploy details.

## 0. Topology at a glance

| Layer | msd | mera-driver | Host | Cost |
|-------|-----|-------------|------|------|
| Frontend (static SPA) | `apps/msd` (React+Vite) | `apps/mera-driver` (Angular) | **Vercel** — 2 projects, global CDN | free |
| API (Express, always-on) | `apps/msd-api` | `apps/mera-driver-api` | **Railway** — 2 services | ~$5–10/mo total |
| Database (Postgres) | db `msd` | db `mera_driver` | **Neon** — 2 independent DBs | free tier |
| Image bytes | bucket `msd-media` | bucket `mera-driver-media` | **Cloudflare R2** — 2 buckets | free (no egress fees) |

**Data flow:** browser → Vercel (static app) → calls the Railway API
(`VITE_API_URL`) → Neon (structured data) + R2 (image uploads). The browser loads
images **directly** from R2's public URL (`VITE_MEDIA_BASE_URL`), never through the
API. TLS is automatic on both Vercel and Railway.

**Why the APIs are off Vercel:** they're long-running Express servers that keep
state in process memory (OTP challenges, rate-limiter, OAuth flow) and accept
uploads. Vercel runs code as short-lived serverless functions with an ephemeral
filesystem, which breaks all three. Railway runs the Express process as-is.

---

## 1. Security model (enterprise, zero hardcoded secrets)

Everything below obeys these rules. **No secret value ever lives in git** — this
doc and the repo contain variable *names* only.

- **Secrets live in exactly two places:** the host's env store (Vercel project env
  vars / Railway service Variables) for cloud, and a git-ignored
  `apps/*/.env.local` for local dev. Never in source, committed files, or a client
  bundle.
- **`.env.example` is the only committed env file** — placeholders only, documents
  shape, never values. (`apps/msd-api/.env.example`,
  `apps/mera-driver-api/.env.example`, `apps/msd/.env.example`.)
- **Frontend = public values only.** Vite bakes `VITE_*` into the browser bundle,
  so it may hold only non-secrets: the API URL, the R2 public URL, and a Google
  Maps key **restricted by HTTP referrer**. Every API secret (DB URL, `JWT_SECRET`,
  OAuth secret, SMTP/SMS, Razorpay, R2 keys) lives **only on Railway**.
- **Per-environment isolation.** Use a distinct `JWT_SECRET` per environment; scope
  Vercel vars **Production vs Preview**; prod and preview may point at different
  API/DB.
- **Least privilege.** The R2 API token has **Object Read & Write on one bucket**
  only; the Neon **direct** connection string is treated as a password; CORS is a
  strict comma-separated allowlist of your real Vercel domains — never `*`.
- **Transport.** HTTPS everywhere (Vercel + Railway terminate TLS). No `http://`
  origins in the production CORS allowlist.
- **Repo access via the platform GitHub app**, scoped to this one repo (Vercel and
  Railway both read the repo this way — grant nothing wider).
- **Rotate anything that ever leaked.** Older `.env.example` files previously held
  real values committed to git history — rotate them at each provider (DB password,
  Gmail app password, SMS key, Razorpay keys) and pick a fresh `JWT_SECRET`.

---

## 2. Branch flow

```
feature/*  ──PR──▶  develop  ──PR──▶  release  ──PR──▶  main
```

- **`feature/*`** — one branch per unit of work. Opening a PR runs the CI gate.
- **`develop`** — integration branch. Push → Vercel preview ("dev") URL.
- **`release`** — release candidate. Push → Vercel preview ("staging") URL; QA
  validates here. Version stamping happens on this branch.
- **`main`** — production. Merge → Vercel deploys to the production domain.

**Always branch new work off `develop`, never `main`.** After every `release →
main`, back-merge into `develop` so the version bump + changelog don't leave
`develop` behind:

```bash
git checkout develop
git pull
git pull origin main --no-edit
git push
```

## 3. Branch → environment mapping

Set **one** thing per Vercel project: *Production Branch = `main`*.

| Git branch | Vercel deploy | Railway | URL |
|------------|---------------|---------|-----|
| `main` | Production | production service | bought custom domain |
| `release` | Preview ("staging") | (optional staging service) | Vercel auto URL |
| `develop` | Preview ("dev") | — | Vercel auto URL |
| `feature/*`, PRs | Preview | — | ephemeral Vercel URL |

APIs: run one Railway service per API tracking `main`. Add a second Railway service
tracking `release`/`develop` only if you need a separate staging API; otherwise
previews point at the production API via `VITE_API_URL` scoping.

---

## 4. Frontends → Vercel

Build config is committed as `apps/<app>/vercel.json` (config-as-code). Each Vercel
project uses **Root Directory = the app folder** with "Include files outside the
Root Directory in the Build Step" on (so `cd ../..` reaches the workspace root),
and **Ignored Build Step = `npx nx-ignore <app>`** so a push only rebuilds the
app(s) its Nx graph actually affects.

`apps/msd/vercel.json` (React + Vite):
```json
{
  "buildCommand": "cd ../.. && npx nx build msd",
  "installCommand": "cd ../.. && npm ci",
  "outputDirectory": "../../dist/apps/msd",
  "ignoreCommand": "cd ../.. && npx nx-ignore msd",
  "framework": null,
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

`apps/mera-driver/vercel.json` (Angular — note the `/browser` subfolder that
`@angular/build:application` emits):
```json
{
  "outputDirectory": "../../dist/apps/mera-driver/browser",
  "buildCommand": "cd ../.. && npx nx build mera-driver",
  "ignoreCommand": "cd ../.. && npx nx-ignore mera-driver"
}
```

**Dashboard settings per project (once):** Root Directory = `apps/msd` /
`apps/mera-driver` (enable "Include files outside root directory"); Production
Branch = `main`; leave Build/Install/Output/Ignored-Build-Step blank —
`vercel.json` wins.

**API base URLs:**
- **msd (Vite):** reads `import.meta.env.VITE_API_URL` at build. Set the `VITE_*`
  vars in the Vercel project (section 8); Vite bakes them at build — redeploy after
  changing.
- **mera-driver (Angular):** the API base is **compile-time** via `fileReplacements`
  (`environment.ts` → `environment.prod.ts`). A Vercel env var won't reach it —
  point `apps/mera-driver/src/environments/environment.prod.ts` at the real
  production API origin. No secrets in `environment.*.ts` — public API base only.

---

## 5. APIs → Railway

Each API is its own Railway service, with build/start config committed as
`apps/<api>/railway.json` (config-as-code, mirroring `vercel.json`):

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "NIXPACKS", "buildCommand": "npm ci && npx nx build msd-api" },
  "deploy": {
    "startCommand": "node dist/apps/msd-api/main.js",
    "preDeployCommand": "node node_modules/prisma/build/index.js migrate deploy --schema=apps/msd-api/prisma/schema.prisma",
    "healthcheckPath": "/api/v1/health",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

Two things make this work — both are already wired in the repo:
1. **`prisma generate` is part of `nx build`.** The `build` target `dependsOn` a
   cached `prisma-generate` target (`apps/<api>/project.json`), so the Prisma client
   is regenerated on every fresh build (CI, Railway) — no separate generate step,
   and no dependence on `.env.local` (generate needs no `DATABASE_URL`).
2. **The build artifact is self-contained.** `webpack.config.js` keeps the generated
   Prisma client external and copies it — with its native query-engine — next to
   `main.js`, and the schema's `binaryTargets` include `debian-openssl-3.0.x` (the
   Railway/Nixpacks runtime). So `node dist/apps/<api>/main.js` finds its Linux
   engine standalone. `preDeployCommand` then applies migrations before each release.

> **Prisma version:** always let the pinned **6.19.3** run (the `npm run
> <api>:prisma:*` scripts and the paths above use it). Bare `npx prisma …` pulls
> Prisma 7, which errors on this schema (`datasource property url is no longer
> supported`).

### Create each Railway service

1. **railway.app → New Project → Deploy from GitHub repo** → this repo (authorize
   the GitHub app, scoped to this repo only).
2. **Root Directory = the repo root** (the Nx workspace) — do **not** set it to
   `apps/<api>`. Railway reads `apps/<api>/railway.json` for build/start/health.
3. **Variables:** add the values from `apps/<api>/.env.example` as real secrets
   (section 8). At minimum: `DATABASE_URL` (Neon direct string), `NODE_ENV=production`,
   `JWT_SECRET` (fresh), the OAuth/OTP/SMTP/SMS/Razorpay keys, the CORS origin(s),
   and the `R2_*` keys.
4. **Settings → Networking → Generate Domain.** Railway gives a public URL like
   `https://msd-api-production.up.railway.app`.

### Per-API specifics

| | msd-api | mera-driver-api |
|-|---------|-----------------|
| Routes mounted at | `/api/v1` | root (no prefix) |
| API base | `<domain>/api/v1` | `<domain>` |
| Health check | `/api/v1/health` | `/health` |
| Swagger docs | `<domain>/docs` | `<domain>/docs` |
| CORS env var | `CORS_ORIGIN` (comma-separated) | `CORS_ORIGINS` (comma-separated) |
| Local port | 3333 | 3334 |
| Google callback | `<domain>/api/v1/auth/google/callback` | `<domain>/auth/google/callback` |

---

## 6. Image storage → Cloudflare R2 (one bucket per API)

Railway's disk is wiped on every redeploy, so uploads live in R2 (S3-compatible,
10 GB free, no egress fees). The DB stores only the relative `storageKey` (the R2
object key); the browser loads bytes directly from R2's public URL.

1. **cloudflare.com → R2 → Create bucket** (`msd-media`, then `mera-driver-media`).
2. **Settings → Public access →** enable the **r2.dev** public URL (or attach a
   custom domain). Copy it, e.g. `https://pub-<hash>.r2.dev` → this is the
   frontend's `VITE_MEDIA_BASE_URL`.
3. **Manage R2 API Tokens → Create API Token →** permission **Object Read & Write**,
   scoped to that one bucket. Copy the **Access Key ID** + **Secret Access Key**
   (shown once).
4. Note your **Account ID** (R2 overview). The S3 endpoint is
   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.

These become the four `R2_*` vars on Railway (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`). The public URL is a **frontend** var, not an
API var — the API only needs the four upload credentials. The R2 client in
`apps/msd-api/src/lib/media-storage.ts` is built lazily, so importing it never
requires R2 configured (tests mock it).

---

## 7. Wire the three together (connect)

Do this once the API has a Railway domain and the bucket has a public URL.

1. **Vercel (per frontend project) →** Settings → Environment Variables:
   - `VITE_API_URL = https://<railway-domain>/api/v1` (msd) — mera-driver sets its
     API base in `environment.prod.ts` instead.
   - `VITE_MEDIA_BASE_URL = https://pub-<hash>.r2.dev`
   - msd only: `VITE_GOOGLE_MAPS_API_KEY` (restricted by referrer).
   - Scope Production vs Preview, then **redeploy** (Vite bakes at build).
2. **Railway →** set the CORS allowlist to the exact Vercel domain(s),
   comma-separated for prod + preview: `CORS_ORIGIN` on **msd-api**, `CORS_ORIGINS`
   on **mera-driver-api**.
3. **Google OAuth →** in Google Cloud Console → your OAuth client, add the
   authorized redirect URI (`<domain>/api/v1/auth/google/callback` for msd-api;
   `<domain>/auth/google/callback` for mera-driver-api) and set the same value as
   `GOOGLE_CALLBACK_URL` on Railway.

---

## 8. Environment-variable reference — where each var lives

| Variable | Local `.env.local` | Vercel | Railway | Notes |
|----------|:------------------:|:------:|:-------:|-------|
| `VITE_API_URL` (msd) | ✅ dev value | ✅ msd project | ❌ | baked into the browser bundle at build |
| `VITE_MEDIA_BASE_URL` (msd) | ✅ | ✅ msd project | ❌ | R2 public URL; **public** |
| `VITE_GOOGLE_MAPS_API_KEY` (msd) | ✅ | ✅ msd project | ❌ | **public** — restrict by HTTP referrer |
| mera-driver API base | ❌ (in `environment.ts`) | ❌ | ❌ | compile-time in `environment.prod.ts` |
| `DATABASE_URL` | ✅ API `.env.local` | ❌ | ✅ | Neon **direct** string; secret |
| `JWT_SECRET` | ✅ | ❌ | ✅ | fresh per environment |
| `GOOGLE_CLIENT_ID` / `_SECRET` / `_CALLBACK_URL` | ✅ | ❌ | ✅ | OAuth app + Railway domain |
| `CORS_ORIGIN` (msd-api) / `CORS_ORIGINS` (mera-driver-api) | ✅ | ❌ | ✅ | comma-separated Vercel domains; no `*` |
| `SMTP_*`, `EMAIL_FROM`, `SMS_*` | ✅ | ❌ | ✅ | OTP delivery |
| `RAZORPAY_*` (msd-api) | ✅ | ❌ | ✅ | client is lazy — API boots without them |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | ✅ | ❌ | ✅ | upload credentials; secret |

**GitHub Actions needs none of these** — CI runs `nx affected -t lint test build`,
which compiles with all of them unset (relevant only at deploy). Add a secret only
if you adopt Nx Cloud (`NX_CLOUD_ACCESS_TOKEN`).

---

## 9. Versioning (`nx release`)

Apps aren't published to a registry, so `nx release` is purely for traceability:
per-app version + `CHANGELOG.md` + git tag. Config lives in `nx.json` (independent
projects, `conventionalCommits`). Run it on the **`release`** branch, before the
`release → main` PR:

```bash
git checkout release && git pull
npx nx release --skip-publish   # bumps only changed apps, writes CHANGELOGs, tags
git push --follow-tags
```

Currently `nx.json` versions the two frontends (`msd`, `mera-driver`). Add the APIs
to `release.projects` only if you want `msd-api@x.y.z` / `mera-driver-api@x.y.z`
tags too (each API would then need a minimal `package.json` with a `version`).

## 10. CI gate

`.github/workflows/ci.yml` runs on PRs into `develop`/`release`/`main`:
`npx nx affected -t lint test build` (base/head via `nrwl/nx-set-shas`). Because
`prisma generate` is part of `build`, the API builds are self-sufficient in CI with
no DB and no `.env.local`. Add it as a required status check in branch protection.

---

## 11. Verify end-to-end (per app, after deploy)

- `https://<railway-domain>/<health path>` returns `{ "data": { "status": "ok" … } }`.
- `<railway-domain>/docs` loads (Swagger renders).
- A public route returns real data from Neon.
- Sign in (OTP / Google), open the account console, confirm data loads and there
  are **no CORS errors** in the browser console.
- Upload an image in the admin console → the object appears in the R2 bucket, the
  image loads in the browser, and **still loads after you redeploy the Railway
  service** (proves it's on R2, not the ephemeral disk).

## 12. Cost note

~$5–10/mo total: the two Railway API services (Hobby plan, $5/mo minimum across the
account). Frontends (Vercel), databases (Neon), and image storage (R2) sit on free
tiers. Keep the frontends on Vercel — serving static files from Railway would cost
extra and lose the global CDN.
