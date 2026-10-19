# skylabs-monorepo

Nx 22 monorepo running **two separate products** from one codebase, sharing a single Material 3
design system.

| App | Tech | Port | Business | Theme |
| --- | --- | --- | --- | --- |
| `apps/msd` | React 19 + Vite | 4200 | Massage deals | Green `#007C2B` |
| `apps/mera-driver` | Angular 21 + Tailwind | 4400 | Driver booking | Blue `#1175BC` |
| `apps/msd-api` | Express + Prisma + PostgreSQL | 3333 | msd backend | - |
| `apps/mera-driver-api` | Express + Prisma + PostgreSQL | 3334 | mera-driver backend | - |

Shared code lives in `packages/` (`shared-ui` design system and the `shared-*` RBAC libraries).
The two apps are different businesses with fully independent backends and databases.

## Quick start

```bash
npm ci

npx nx serve msd                # http://localhost:4200
npx nx run mera-driver:serve    # http://localhost:4400
npx nx serve msd-api            # http://localhost:3333/api/v1  (docs at /docs)
npx nx serve mera-driver-api    # http://localhost:3334         (docs at /docs)

npx nx run-many -t lint test build
npx nx affected -t build --base=main
```

Env files, Prisma and database setup: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#10-local-development).

## Docs

Everything starts at [`docs/README.md`](docs/README.md):

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): monorepo layout, shared packages, dynamic RBAC
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md): Vercel, Railway, Neon, R2, branch flow, first-time setup
- [`docs/msd/README.md`](docs/msd/README.md) and [`docs/mera-driver/README.md`](docs/mera-driver/README.md):
  per-app status, planning, architecture, database, API, tasks, testing, deployment
- [`CLAUDE.md`](CLAUDE.md): conventions for Claude Code and the AI dev team

## Deployment in one paragraph

Branch flow `feature/* → develop → release → main`. The two frontends deploy to two independent
Vercel projects; each self-selects on every push with `nx-ignore`, so a commit only rebuilds the
apps it affects. `main` is Production (custom domain); `release` and `develop` use Vercel preview
URLs. Versioning is `npx nx release --skip-publish` on the `release` branch. The two Express APIs
run on Railway, each with its own Neon Postgres database; msd media lives on Cloudflare R2.
