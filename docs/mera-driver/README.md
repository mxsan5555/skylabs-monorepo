# mera-driver

Driver booking platform. Customers and companies book drivers; drivers register, complete KYC and
take trips; staff run onboarding, KYC, dispatch and accounts from one permission-driven console.
Apps: `apps/mera-driver` (Angular 21 + Tailwind, port 4400, blue theme) and
`apps/mera-driver-api` (Express + Prisma + PostgreSQL, port 3334, routes at root).

## Which file answers what

| I want to know | Read |
|---|---|
| Roles, permission matrix, business rules | [`PLANNING.md`](PLANNING.md) |
| How it works in code, portals, gaps | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Tables, enums, proposed entities | [`DATABASE.md`](DATABASE.md) |
| Endpoints and their permissions | [`API.md`](API.md) |
| What is done and what is next | [`TASKS.md`](TASKS.md) |
| How to test, acceptance scenarios | [`TESTING.md`](TESTING.md) |
| Env vars and deploy status | [`DEPLOYMENT.md`](DEPLOYMENT.md) |

## Working on a feature

Follow the shared workflow in [`../README.md`](../README.md#how-to-work-on-a-feature-both-apps-people-and-claude-code):
find the module below, then use its section number in every file. Example: final KYC approval is module 4, so `PLANNING.md` §4, `DATABASE.md` §4, `API.md` §4, `TESTING.md` §4, `TASKS.md` §4.

## Module status (2026-10-17)

| # | Module | Built | Next |
|---|---|---|---|
| 1 | Administration | OTP, Google and password sign-in; dynamic RBAC; roles, users, audit screens; Login As; 13 seeded roles | Apply the final matrix and special actions (A-01 to A-05) |
| 2 | Customers | Admin CRUD, portal login linking, customer portal | Ownership check (C-01) |
| 3 | Drivers | Onboarding wizard, documents, driver portal, account status gate, attendance, locations | Limited views, resume vs report export, foreign keys |
| 4 | KYC and verification | KYC status on the driver, reviewer assignment, checklist | Separate final approval (K-01), one KYC module (K-02) |
| 5 | Bookings and trips | Trip types, bookings, locations, cancellation reasons, pricing; `/ride/*` UI | Foreign keys, Requirement, Assignment |
| 6 | Vehicles | Vehicle and vehicle type CRUD | Customer relation |
| 7 | Accounts | Stubs | Real payments and reports |
| 8 | Partners | Roles only | Vendor and company entities and portals |
| 9 | Support and content | Console pages only | API modules |
| 10 | Masters | 10 lookup lists | Menu order fix |
| 11 | Platform | CI gate | Fix 12 failing specs, deploy the API |

Task totals: 0 of 29 done (see `TASKS.md`).
