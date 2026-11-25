---
description: >
  Build, change or fix anything to Sandeep's standard: no hardcoding, DRY and
  reusable, semantic + accessible + responsive, SEO/GEO/AEO, API and database
  security, unit tests. Then self-check and report per rule.
argument-hint: <what to build, change or fix> [path]
---
Task: $ARGUMENTS

Work as one agent. Do not start a multi-agent pipeline.

## 1. Scope

- Read the project `CLAUDE.md` and its docs entry point first. Project rules
  win over this command (stack, copy source, docs workflow, git rules).
- Decide what the task touches: UI, public page, API, database, shared
  library. Apply only the rules and skills for those areas.
- No task given: skip to step 5 and check the working-tree diff
  (`git diff HEAD`) only, never the whole repo.

## 2. Reuse first

- Search for existing components, hooks, utils, tokens, types, schemas and
  validators before writing anything.
- Extend what exists with opt-in options that keep the default behaviour.
  Never copy a component or function to change it.

## 3. Tests first

Write or update unit tests for the intended behaviour before the code: happy
path, edge cases, invalid or refused input, accessibility attributes. Use the
project's test runner. Reference: `~/.claude/skills/testing-strategy.md`.

## 4. Build to the six rules

1. **No hardcoded code or style**
   - Colours, spacing, type, radius, elevation and motion come from design
     tokens or theme roles. No hex, rgb or one-off px values in app code.
   - User-facing copy lives in the project's content or i18n source.
   - URLs, keys, limits and feature switches come from env, config or named
     constants. No magic numbers.
2. **DRY, reusable, scalable**
   - One source of truth per concept; shared types across layers.
   - Small composable units; options over forks.
   - Abstract only on a real second use or a stated shared need.
3. **Semantic, accessible, responsive** (`~/.claude/skills/accessibility.md`)
   - Landmarks and real elements (`button`, `a`, `nav`, `main`, lists,
     headings in order). ARIA only where native HTML cannot do it.
   - Every control labelled; full keyboard path; visible focus.
   - WCAG 2.2 AA contrast minimum; respects reduced motion.
   - Mobile first; no horizontal scroll at 320 px; touch targets 24 px+.
4. **SEO / GEO / AEO**, public pages only (`~/.claude/skills/seo-geo-aeo.md`)
   - Unique title and meta description, one h1, canonical, Open Graph.
   - JSON-LD that matches visible content; alt text on meaningful images.
   - Crawlable links; sitemap, robots and llms.txt updated where the project
     has them; works with prerender or SSR.
   - `noindex` on auth, account, cart and checkout pages.
5. **API and database security** (`~/.claude/skills/security-rls.md`,
   `~/.claude/skills/api-patterns.md`)
   - Validate every input at the boundary with the project's schema
     validator; reject unknown fields.
   - Server-side auth and permission check on every route; the frontend
     guard is never the security boundary.
   - ORM or parameterised queries only; least-privilege data access (RLS
     where the database supports it); users reach only their own records.
   - Consistent error shape, no stack traces or internals in responses.
   - Rate limit sensitive routes; secrets only from env, never in code.
   - Stop and ask before any schema change or public API change.
6. **Unit tests**: new and changed behaviour covered; known pre-existing
   failures must not grow.

## 5. Self-check (bounded)

One pass, fix everything it finds in one batch, one confirm pass. No loops.

- Run tests, lint and type-check for the touched projects only.
- Apply the `frontend-sweep` and `backend-sweep` rules to the changed files.
- Scan the diff for hex colours, raw px values, inline copy strings and
  anything that looks like a secret.
- UI work: when a dev server runs, check the screen at desktop and phone
  width in a browser.
- Update the project's docs where its workflow asks for it.

## 6. Report

End with this table, then test results with counts and anything skipped:

| Rule | Status | Notes |
|---|---|---|
| No hardcoding | Pass / Fixed / N/A / Needs decision | |
| DRY + reusable | | |
| Semantic + accessible + responsive | | |
| SEO / GEO / AEO | | |
| API + DB security | | |
| Unit tests | | |

Never commit without confirmation: show the one-line commit message and the
staged file list, then wait for a yes.
