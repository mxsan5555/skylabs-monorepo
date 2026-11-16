# Documentation

Single source of truth for developers, testers and business. Every fact lives in exactly one
file; other files link to it instead of repeating it.

## Where to look

| Question | File |
|---|---|
| How the monorepo is organised, shared packages, how RBAC works in both apps | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| How the apps ship (Vercel, Railway, Neon, R2), first-time setup, local dev | [`DEPLOYMENT.md`](DEPLOYMENT.md) |
| msd (massage deals): status, rules, design, data, API, tasks, tests, deploy | [`msd/README.md`](msd/README.md) |
| mera-driver (driver booking): same set | [`mera-driver/README.md`](mera-driver/README.md) |
| Conventions for Claude Code and the AI dev team | [`../CLAUDE.md`](../CLAUDE.md) |

## The eight files per app

Each app folder (`msd/`, `mera-driver/`) has the same eight files. Inside each file the modules
appear with the same headings in the same order, so section 2 of `PLANNING.md` and section 2 of
`DATABASE.md` always describe the same module.

| File | Reader | Holds |
|---|---|---|
| `README.md` | everyone | What the app is, module status table, current focus |
| `PLANNING.md` | business, everyone | Scope, roles, permission matrix, business rules per module, decisions |
| `ARCHITECTURE.md` | developer | App structure, how each module works in code, known gaps |
| `DATABASE.md` | developer | Tables, enums, relations, migrations, data rules per module |
| `API.md` | developer, tester | Conventions and every endpoint per module with its permission |
| `TASKS.md` | everyone | One task list per module with stable IDs and "Done when" |
| `TESTING.md` | tester, developer | How to run tests, known failures, acceptance and UAT per module |
| `DEPLOYMENT.md` | ops | App-specific env vars, jobs, release order (shared steps live in `../DEPLOYMENT.md`) |

## Rules that keep the docs true

1. **No new Markdown files.** New work goes into the matching module section of the eight files.
   A design that needs review is written into `PLANNING.md` under that module as "Proposed",
   reviewed there, and becomes the rule once approved.
2. **A task is done only when its module section matches the code** in `PLANNING.md`,
   `DATABASE.md`, `API.md` and `TESTING.md` (see the definition of done in each `TASKS.md`).
3. **Generated tables are not edited by hand.** The endpoint tables in `API.md` and the model
   tables in `DATABASE.md` were generated from the running routers and `schema.prisma` on
   2026-10-17. Regenerate them after route or schema changes (the method is described at the
   top of each file).
4. **History lives in git, not in docs.** Old specs, plans and superseded docs were deleted on
   2026-10-17. Read any of them with `git show <rev>:<path>`.

## How to work on a feature (both apps, people and Claude Code)

Always enter through the app's `README.md`, find the module, then use **that module's numbered
section in every file** (for example, Members is §2 in every msd file). `§n` below means the
module's section.

### New feature

| Step | Who | File and section | What to do |
|---|---|---|---|
| 1. Find it | everyone | `<app>/README.md`, module status table | Find the module and its section number |
| 2. Task | lead | `TASKS.md` §n | Find the task, or add a row at the end of §n with the next ID |
| 3. Rules | business + lead | `PLANNING.md` §n | Write the rules under a "Proposed" heading (who can do it per the permission matrix, states, messages, edge cases); business approves, then drop "Proposed" |
| 4. Design | developer | `<app>/ARCHITECTURE.md` §n, `docs/ARCHITECTURE.md` §3.4 | Decide services, screens and permission keys; follow the menu, seed and route recipe |
| 5. Data | developer | `DATABASE.md` §n | Describe new tables, columns, enums. **Stop for review before any schema change** |
| 6. Endpoints | developer | `API.md` §n | Describe new routes, permissions, field rules. **Stop for review before any API change** |
| 7. Test cases | tester | `TESTING.md` §4.n | Write acceptance checks from step 3 (allowed, refused, own records only) before coding |
| 8. Build | developer | code | Migration with `down.sql`, route with `requirePermission`, screen, tests |
| 9. Verify | tester | `TESTING.md` §1 to §3, §5, §6 | Run the tests (known failures in §3 must not grow), security checklist, UAT per role |
| 10. Deploy prep | ops | `<app>/DEPLOYMENT.md`, `docs/DEPLOYMENT.md` | New env vars, jobs, API-before-frontend order |
| 11. Close | developer | `TASKS.md` §n | Tick `[x]` in the same commit, after checking steps 3, 5, 6 and 7 match the code |

### Change to an existing feature

1. `<app>/README.md` → module.
2. `PLANNING.md` §n: change the rule first; business approves.
3. `ARCHITECTURE.md` §n: find where it lives in code.
4. `DATABASE.md` §n and `API.md` §n: update only if data or endpoints change (review first;
   regenerate the tables).
5. `TESTING.md` §4.n: update the acceptance line.
6. `TASKS.md` §n: add a row, build, tick it.
7. `DEPLOYMENT.md`: only if env vars, jobs or release steps change.

### Bug fix

`TASKS.md` §n (add a row) → `ARCHITECTURE.md` §n (where it lives) → fix with a test that fails
without the fix → `TESTING.md` §4.n (add the case if a rule was missing) → tick the task.
`PLANNING.md` changes only when the bug was a wrong or unclear rule.

### Who reads and writes what

| Role | Reads | Writes |
|---|---|---|
| Business / owner | `README.md`, `PLANNING.md`, `TASKS.md` progress | approves `PLANNING.md` rules, answers open decisions |
| Developer | all eight files, module section only | `ARCHITECTURE.md`, `DATABASE.md`, `API.md`, ticks `TASKS.md` |
| Tester | `PLANNING.md`, `API.md`, `TESTING.md` | `TESTING.md` acceptance and known failures |
| Ops | `docs/DEPLOYMENT.md`, `<app>/DEPLOYMENT.md` | `<app>/DEPLOYMENT.md` |
