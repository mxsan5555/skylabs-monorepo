# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo State

This is a freshly scaffolded Nx 22.7.5 monorepo. No apps or libs have been created yet. The only dependency is `nx` itself. All project generation, build, lint, and test commands must be added as apps/libs are created.

## Monorepo Tool

Nx 22.7.5 is the workspace manager. The `defaultBase` in nx.json is `"master"` but the active Git branch is `main` — update `nx.json` if CI affected-command comparisons are needed.

## Generating Projects

```bash
# React/Next.js app
npx nx generate @nx/react:app apps/<name>
npx nx generate @nx/next:app apps/<name>

# Node/NestJS backend
npx nx generate @nx/node:app apps/<name>
npx nx generate @nx/nest:app apps/<name>

# Flutter (run from outside Nx, add to nx.json manually)

# Shared library
npx nx generate @nx/js:lib libs/<name>
```

Always place applications under `apps/` and shared code under `libs/`.

## Running Tasks (once projects exist)

```bash
npx nx run <project>:<target>          # e.g. npx nx run my-app:build
npx nx run <project>:test              # run all tests for a project
npx nx run <project>:test --testFile=path/to/spec.ts  # single test file
npx nx run <project>:lint
npx nx affected -t build               # only projects affected by current changes
npx nx affected -t test --base=main
npx nx graph                           # visualize project dependency graph
```

## Stack Defaults for This Workspace

Per team standards (global CLAUDE.md):
- Web: Next.js 14 + TypeScript + Tailwind + shadcn/ui
- Mobile: Flutter (cross-platform)
- Backend: NestJS + OpenAPI
- Database: Supabase (PostgreSQL + RLS + Auth)
- Hosting: Vercel (frontend), Railway or Fly.io (backend)
- CI/CD: GitHub Actions

## Architecture Conventions

- `apps/` — deployable applications (web, mobile, API servers)
- `libs/` — shared libraries (UI components, utilities, data access, types)
- Tag projects in `project.json` (`type:app`, `type:lib`, `scope:<domain>`) and enforce boundaries in `nx.json` via `@nx/enforce-module-boundaries`
- Shared TypeScript types live in a `libs/shared/types` library, never duplicated across apps

## Environment Variables

Each app manages its own `.env.local` (never committed). Add `.env.example` to each app when created. Secrets go in CI/CD environment variables, never in source.
