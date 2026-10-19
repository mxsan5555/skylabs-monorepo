# Deployment

How both apps ship: frontends on **Vercel**, Express APIs on **Railway**, Postgres on **Neon**,
uploaded images on **Cloudflare R2**. App-specific env vars, scheduled jobs and release checks
are in `docs/msd/DEPLOYMENT.md` and `docs/mera-driver/DEPLOYMENT.md`.

## 1. Topology

| Layer | msd | mera-driver | Host | Cost |
|---|---|---|---|---|
| Frontend (static SPA) | `apps/msd` | `apps/mera-driver` | Vercel, 2 projects, global CDN | free |
| API (always-on Express) | `apps/msd-api` (`/api/v1`) | `apps/mera-driver-api` (root) | Railway, 2 services | about $5 to $10 per month in total |
| Database | db `msd` | db `mera_driver` | Neon, 2 independent DBs, created from each Vercel project's Storage tab | free tier |
| Image bytes | bucket `msd-media` | none yet | Cloudflare R2 | free, no egress fees |

Browser → Vercel (static app) → Railway API (`VITE_API_URL`) → Neon (data) and R2 (uploads). The
browser loads images straight from R2's public URL (`VITE_MEDIA_BASE_URL`), never through the API.
The frontend never touches the database.

The APIs are off Vercel because they are long-running servers that keep state in memory (OTP
challenges, rate limiter, OAuth flow) and accept uploads; Vercel functions are short-lived with
an ephemeral disk.

## 2. Security model

- **No secret value in git.** Docs and repo carry variable names only. Secrets live in the host
  env stores (Vercel, Railway) and in git-ignored `apps/*/.env.local`.
- **`.env.example` is the only committed env file**: placeholders only.
- **Frontend values are public.** Vite bakes `VITE_*` into the bundle, so only the API URL, the
  R2 public URL and a referrer-restricted Maps key may go there. Every API secret lives only on
  Railway.
- **Per environment:** a distinct `JWT_SECRET` per environment; Vercel vars scoped Production vs
  Preview.
- **Least privilege:** the R2 token has Object Read & Write on one bucket; the Neon direct
  connection string is treated as a password; CORS is a strict allowlist of real Vercel domains,
  never `*`.
- **HTTPS everywhere**; no `http://` origin in the production CORS list.
- **Repo access** through the Vercel and Railway GitHub apps, scoped to this repo only.
- **Rotate anything that ever leaked.** Older `.env.example` files once held real values that are
  still in git history (tracked as task X-03 in `docs/msd/TASKS.md`).

## 3. Branch flow and environments

```
feature/*  --PR-->  develop  --PR-->  release  --PR-->  main
```

| Branch | Vercel | Railway | URL |
|---|---|---|---|
| `main` | Production | production service | bought custom domain |
| `release` | Preview ("staging") | optional staging service | Vercel auto URL |
| `develop` | Preview ("dev") | - | Vercel auto URL |
| `feature/*`, PRs | Preview | - | temporary Vercel URL |

- Always branch new work off `develop`, never `main`.
- After every `release → main`, back-merge into `develop` so the version bump and changelog do
  not leave `develop` behind:
  ```bash
  git checkout develop && git pull && git pull origin main --no-edit && git push
  ```
- `nx.json` `defaultBase` is `main`; `nx affected` in CI and `nx-ignore` on Vercel compare
  against it.

## 4. Frontends on Vercel

Build config is committed as `apps/<app>/vercel.json`. Each Vercel project uses Root Directory =
the app folder with "Include files outside the Root Directory" on, and the Ignored Build Step
`npx nx-ignore <app>`, so a push only rebuilds the apps its Nx graph affects. Leave Build,
Install, Output and Ignored Build Step blank in the dashboard; `vercel.json` wins. Production
Branch = `main`.

- **msd (Vite)** reads `import.meta.env.VITE_*` at build. Set them in the Vercel project and
  **redeploy after every change**; a var set without a redeploy does nothing. msd builds with a
  prerender step (`npx nx run msd:prerender`), which calls the API at build time.
- **mera-driver (Angular)** has no Vercel env vars. Its API base is compile-time in
  `apps/mera-driver/src/environments/environment.prod.ts` (output folder is `.../browser`).

## 5. APIs on Railway

One Railway service per API. Railway only auto-reads a config file at the repo root, so set the
commands in the UI (or point Config-as-code at `apps/<api>/railway.json`):

| Setting | Value (msd-api shown; swap the name for mera-driver-api) |
|---|---|
| Root Directory | empty (repo root), never `apps/<api>` |
| Build | `npm ci && npx nx build msd-api` |
| Start | `node dist/apps/msd-api/main.js` |
| Pre-deploy | `node node_modules/prisma/build/index.js migrate deploy --schema=apps/msd-api/prisma/schema.prisma` |

- `prisma generate` is part of `nx build` (the `build` target depends on `prisma-generate`), so
  CI and Railway need no separate step and no `.env.local`.
- The build output is self-contained: webpack copies the generated client and its Linux query
  engine next to `main.js` (`binaryTargets` include `debian-openssl-3.0.x`).
- Always use the pinned Prisma 6.19.3 (`npm run <api>:prisma:*` or the path above). Bare
  `npx prisma` pulls Prisma 7, which rejects this schema.
- **Networking:** Settings → Networking → Generate Domain. The target port must equal the port
  the app listens on: set the target to `3333` / `3334` and add a matching `PORT` variable. A 502
  means they differ.
- **`DATABASE_URL`** must be the Neon **direct** string (host without `-pooler`, ending
  `?sslmode=require`); `migrate deploy` fails over the pooled endpoint. Copy it from the Vercel
  project → Storage → the Neon DB. Do not click "Connect" there (that wires the DB to the
  frontend, which never uses it).
- **`CORS_ORIGIN`** (msd-api) / **`CORS_ORIGINS`** (mera-driver-api) is the exact Vercel origin:
  scheme and host, no trailing slash, no path, comma-separated for several.

| | msd-api | mera-driver-api |
|---|---|---|
| Routes at | `/api/v1` | root |
| Health | `/api/v1/health` | `/health` |
| Swagger | `/docs` | `/docs` |
| CORS var | `CORS_ORIGIN` | `CORS_ORIGINS` |
| Local port | 3333 | 3334 |
| Google callback | `<domain>/api/v1/auth/google/callback` | `<domain>/auth/google/callback` |

**First deploy notes**

- Pre-deploy fails with `P3009` (a failed migration recorded in the DB): run once against the
  Neon direct URL, either `migrate reset --force --skip-seed` (disposable DB) or
  `migrate resolve --rolled-back <name>` (keep data), then redeploy.
- Seed roles and the Super Admin once after the first migrate: `npm run <api>:prisma:seed` with
  the Neon URL, `JWT_SECRET` and `SUPERADMIN_PHONE` in that API's `.env.local`.

## 6. Images on Cloudflare R2 (msd only today)

Railway's disk is wiped on every redeploy, so uploads live in R2. The DB stores only the relative
`storageKey`.

1. R2 → Create bucket `msd-media`.
2. Bucket → Settings → Public Development URL → Enable. Copy `https://pub-<hash>.r2.dev`; that is
   the frontend's `VITE_MEDIA_BASE_URL` (no trailing slash).
3. R2 overview → copy the Account ID (`R2_ACCOUNT_ID`; S3 endpoint
   `https://<id>.r2.cloudflarestorage.com`).
4. Manage R2 API Tokens → Create **Account** API token, Object Read & Write, only bucket
   `msd-media`. Copy the Access Key ID and Secret (shown once).
5. Railway (msd-api): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_BUCKET=msd-media`. Vercel (msd): `VITE_MEDIA_BASE_URL`, then redeploy.

6. Create a second bucket `msd-private` and leave **public access off** (no r2.dev URL, no
   custom domain). Give the same API token Object Read & Write on it (or a second token), and set
   `R2_PRIVATE_BUCKET=msd-private` on Railway. Member documents go here and open only through
   5-minute signed links.
7. Local development: create `msd-media-dev` (public dev URL on) and `msd-private-dev` (public off)
   and put them in `apps/msd-api/.env.local` as `R2_BUCKET` / `R2_PRIVATE_BUCKET`, with the dev
   bucket's URL as `VITE_MEDIA_BASE_URL` in `apps/msd/.env.local`. Same folder layout as
   production (`docs/msd/ARCHITECTURE.md` §12.3); never the production buckets.

Uploads go through the API, so the bucket needs no CORS config. mera-driver-api has no media
variables yet; create a `mera-driver-media` bucket only when it adds uploads.

## 7. Wire the pieces together

1. Vercel (msd): `VITE_API_URL = https://<railway-domain>/api/v1`, `VITE_MEDIA_BASE_URL`, map vars;
   scope Production vs Preview; redeploy. mera-driver: set the API base in `environment.prod.ts`.
2. Railway: CORS allowlist = the exact Vercel domains.
3. Google Cloud → OAuth client: add the authorized redirect URI and set the same value as
   `GOOGLE_CALLBACK_URL` on Railway.

Where each kind of variable lives:

| Variable | Local `.env.local` | Vercel | Railway |
|---|:-:|:-:|:-:|
| `VITE_*` (msd, public) | yes | msd project | no |
| mera-driver API base | `environment.ts` | no | no |
| `DATABASE_URL`, `JWT_SECRET`, OAuth secret, `SMTP_*`, `SMS_*`, `RAZORPAY_*`, `R2_*`, `CRON_SECRET` | API `.env.local` | no | yes (secret) |
| `CORS_ORIGIN` / `CORS_ORIGINS` | yes | no | yes |

Full per-service tables: `docs/msd/DEPLOYMENT.md` and `docs/mera-driver/DEPLOYMENT.md`. GitHub
Actions needs none of these (CI compiles with all of them unset).

## 8. Versioning and CI

- `nx release` gives per-app version, `CHANGELOG.md` and git tag. Run it on `release` before the
  `release → main` PR: `git checkout release && git pull && npx nx release --skip-publish && git push --follow-tags`.
  `nx.json` versions the two frontends; add the APIs to `release.projects` only if you want API tags.
- `.github/workflows/ci.yml` runs `npx nx affected -t lint test build` on PRs into
  `develop`/`release`/`main`. Make it a required status check.

## 9. Verify after a deploy

- `<railway-domain>/<health path>` returns `{ "data": { "status": "ok" ... } }`; `/docs` renders.
  The bare `/api/v1` returns a `NOT_FOUND` envelope, which is expected.
- A public route returns real data from Neon.
- Sign in (OTP or Google), open the console, no CORS errors in the browser console.
- Upload an image: it appears in R2, displays, and still loads after a Railway redeploy.
- App-specific checks: each app's `DEPLOYMENT.md`.

**Deploy order when the API contract changes:** ship the API first, then the frontend that calls
the new endpoint or parameter. Additive API changes are safe ahead of the frontend.

**Common trip-ups:** no data or CORS errors → CORS origin is not the exact Vercel domain, or
`VITE_API_URL` was set after the build (redeploy). 502 → `PORT` differs from the target port.
`P3009` → see section 5. Pre-deploy cannot reach the DB → localhost or `-pooler` URL. Images 404
→ R2 public URL not enabled, or Vercel not redeployed after setting `VITE_MEDIA_BASE_URL`.

## 10. Local development

Prerequisites: Node 20, npm, PostgreSQL 16 (local install or Docker; never point local work at the
Neon production database).

```bash
npm ci
# copy each .env.example to .env.local and fill it (git-ignored):
#   apps/msd/.env.local, apps/msd-api/.env.local, apps/mera-driver-api/.env.local
#   (mera-driver has no env file; it uses environment.ts)

# Prisma per API (pinned scripts, never bare `npx prisma`)
npm run msd-api:prisma:generate && npm run msd-api:prisma:migrate && npm run msd-api:prisma:seed
npm run mera-driver-api:prisma:generate && npm run mera-driver-api:prisma:migrate && npm run mera-driver-api:prisma:seed

npx nx serve msd                 # http://localhost:4200
npx nx run mera-driver:serve     # http://localhost:4400
npx nx serve msd-api             # http://localhost:3333/api/v1 (docs at /docs)
npx nx serve mera-driver-api     # http://localhost:3334 (docs at /docs)
```

## 11. First-time cloud setup (order)

1. **GitHub:** get the code onto `main` through the branch flow. `nx release` is optional until
   the pipeline is stable.
2. **Prerequisite accounts:** GitHub access; Vercel team with the Vercel GitHub app; Railway with
   the Railway GitHub app; Cloudflare (R2); Google Cloud (OAuth, Maps) when needed. 2FA everywhere;
   restrict who can edit Production env vars.
3. **Vercel:** Add New → Project → this repo; Root Directory `apps/msd`; framework Other; set the
   `VITE_*` vars; deploy. Create the Neon DB under the project's Storage tab and copy the direct
   connection string.
4. **Railway:** New Project → Deploy from GitHub → this repo; rename the service `msd-api`; set the
   commands from section 5; add the variables (`docs/msd/DEPLOYMENT.md`); generate the domain with
   target port 3333; turn on auto deploys; seed once.
5. **R2:** section 6.
6. **Wire and verify:** sections 7 and 9.
7. Repeat steps 3 and 4 for mera-driver with its own Vercel project, Neon DB and Railway service.
