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

---

## 3. Provision the cloud backends first

The frontends need real API URLs to point at, so stand up the APIs before the
Vercel projects. For **each** API follow **`DEPLOYMENT.md` §5 (Railway)** and **§6
(Cloudflare R2)**:

1. Create the **Neon** database, copy its **direct** connection string
   (`DATABASE_URL`).
2. Create the **Railway** service from the repo (Root Directory = repo root; it
   reads the committed `apps/<api>/railway.json`), set its Variables, and generate a
   public domain.
3. Create the **R2** bucket, enable its public URL, and mint a bucket-scoped Object
   Read/Write token.

---

## 4. Corporate Vercel Team + move off the personal account

Do a **fresh import** into the corporate team (cleaner than transferring the old
projects).

1. **Corporate Vercel Team → Add New → Project →** import this GitHub repo
   (authorize the corporate Vercel GitHub app on the org first).
2. Create **two** projects following **`DEPLOYMENT.md` §4**:
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
