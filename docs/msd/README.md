# msd (MySpaDeal)

Massage, spa and wellness deals marketplace. Members (spas, salons, therapists) list deals,
therapists and products by branch; customers find, buy and book them; staff run everything from
one permission-driven console. Apps: `apps/msd` (React 19 + Vite, port 4200, green theme) and
`apps/msd-api` (Express + Prisma + PostgreSQL, port 3333, `/api/v1`).

## Which file answers what

| I want to know | Read |
|---|---|
| Who can do what, and the business rules of a module | [`PLANNING.md`](PLANNING.md) |
| How a module works in code | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Tables, enums, migrations | [`DATABASE.md`](DATABASE.md) |
| Endpoints and their permissions | [`API.md`](API.md) |
| What is done and what is next | [`TASKS.md`](TASKS.md) |
| How to test it and what "works" means | [`TESTING.md`](TESTING.md) |
| Env vars, scheduled jobs, release checks | [`DEPLOYMENT.md`](DEPLOYMENT.md) |

Monorepo-wide topics (shared packages, RBAC recipes, hosting): [`../README.md`](../README.md).

## Working on a feature

Follow the shared workflow in [`../README.md`](../README.md#how-to-work-on-a-feature-both-apps-people-and-claude-code):
find the module below, then use its section number in every file. Example: customer block/unblock is module 3, so `PLANNING.md` §3, `DATABASE.md` §3, `API.md` §3, `TESTING.md` §4.3, `TASKS.md` §3.

## Module status (2026-10-17)

| # | Module | Built | Next | Tasks done |
|---|---|---|---|---|
| 1 | Admin and staff | OTP and Google sign-in, dynamic RBAC, role, user and audit screens, Login As | Enforce own scope, 14-key permission matrix, staff users, settings | 1 of 30 |
| 2 | Members | Lifecycle (active, inactive, suspended, archived), documents with review, reminders and review flag, Remind now, member list and detail tabs, catalog CRUD | Own-scope routes, flat catalog routes, deal approval removal, signed document links | 30 of 87 |
| 3 | Customers and orders | Cart, wishlist, checkout with Razorpay and COD, order history, support requests | Cancel, refund requests, customer block | 0 of 10 |
| 4 | Storefront | Header, footer, tab bar, home, category page with filters, sorts and map, prerender and SEO files | Follow-ups ST-01 to ST-28 | 0 of 29 |
| 5 | Static content | Blog, FAQs, legal pages, about, contact, how it works, careers screens and public APIs | `content` permission key, rich text sanitizing | 0 of 5 |
| 6 | CTA banners | Promotions screen and public API | Write placement and editing rules | 0 of 1 |
| 7 | Home slider | Home hero screen and public API | Write slide rules | 0 of 1 |
| 8 | Masters | Categories, popular tags, popular treatments | Load the approved category tree | 0 of 1 |
| 9 | Payments, payouts and reports | Razorpay payments, nine summary reports | Payouts, the six business reports, export | 0 of 11 |
| 10 | Analytics | Not started | GA4, GTM, consent, events | 0 of 3 |
| 11 | Social media | Social links screen, footer and JSON-LD | Write the wider scope | 0 of 1 |
| 12 | Platform, security and release | CI gate, Vercel and Railway deploys | Hardening, OpenAPI coverage, security QA, release | 1 of 65 |

Current focus: finish the member release (pending before production: P10-43, P10-44, P10-45,
P6-07), then customers, admin and staff, static content, CTA banners, home slider, analytics and
social media.
