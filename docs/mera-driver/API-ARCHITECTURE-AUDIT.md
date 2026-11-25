# Mera Driver API: Endpoint and Architecture Audit

**Review date:** 2026-11-24
**Scope:** `apps/mera-driver-api` source, generated OpenAPI document, API docs, and automated
tests. This is a source/test audit, not a live production availability check.

## Executive summary

**The API has solid architectural building blocks, but the available evidence does not support
claiming that every endpoint is fully documented or live-verified.**

| Area | Finding |
|---|---|
| Automated tests | `npx.cmd nx test mera-driver-api` passed: **702 passed, 1 skipped** (49 test files; 48 passed). |
| Build | `npx.cmd nx build mera-driver-api` succeeded. Nx reused existing cached outputs for some dependencies. |
| API structure | Express routers, service modules, Prisma, Zod request validation, JWT authentication, permission and ownership checks, a common error handler, and OpenAPI 3.1 are present. |
| OpenAPI coverage | The current generated OpenAPI document has **147 operations across 94 paths**. A source scan found **175 explicit handlers** in mounted `*.routes.ts` modules, before counting app-level routes, generated master-list routes, and static upload serving. The spec does not describe the whole current API. |
| Existing endpoint inventory | [`API.md`](API.md) says its tables were generated on 2026-10-17 and records 149 mounted routes / 147 documented. That is a historical snapshot; current source includes additional routes. |
| Live behavior | Not verified against a running deployment, live database, payment provider, or SMS/email provider. Unit tests use mocked Prisma. |

The test/build results show a healthy automated baseline, **not** that every business workflow
works end to end. In particular, payment/reporting reads have stubs and some modules are not
implemented.

## What an API contract should define

For each operation, a complete API contract should make these details clear:

1. **Method and path:** for example, `POST /auth/otp/verify`.
2. **Purpose and lifecycle:** what the operation does and whether it is implemented, a stub, or
   planned.
3. **Authentication and authorization:** public, bearer-authenticated, permission-gated, or
   ownership/assignment-scoped.
4. **Request:** path/query parameters, headers, content type, request body, validation constraints.
5. **Success response:** HTTP status, envelope, response fields/schema, and pagination metadata.
6. **Errors:** HTTP status, stable error code, message, and validation details.
7. **Operational behavior:** rate limits, retries/idempotency, external-provider behavior,
   deprecation, and version compatibility where relevant.
8. **Machine-readable documentation and tests:** OpenAPI contract plus tests for permitted,
   denied, invalid, missing, and successful requests.

Mera Driver implements many of these consistently, but there are material gaps in coverage and
documented response/error contracts.

## API architecture and conventions found

### Routing and modules

- Express app is assembled in [`app.ts`](../../apps/mera-driver-api/src/app.ts); it mounts domain
  routers and registers not-found/error middleware last.
- Route handlers commonly delegate business operations to services, which use Prisma for database
  access.
- The API is mounted at the **root** (`http://localhost:3334` locally); routes do **not** currently
  have an `/api/v1` prefix.
- Swagger UI is served at `/docs`; the generated OpenAPI document declares OpenAPI `3.1.0`.

### Authentication and authorization

- Bearer JWT authentication is handled by [`authenticate.ts`](../../apps/mera-driver-api/src/middleware/authenticate.ts).
- Access tokens default to 15 minutes; the token payload is designed to avoid PII. Refresh-session
  handling is implemented separately.
- Protected staff operations use `requirePermission(menuKey, action)`, which resolves permissions
  from the database instead of trusting a frontend guard.
- Customer/driver self-service uses server-resolved ownership context; some staff actions also
  apply record ownership or assignment checks.
- These are strong patterns, but each newly added route still needs its own correct middleware and
  scope tests.

### Validation and response envelope

- Zod request schemas are applied by [`validate.ts`](../../apps/mera-driver-api/src/middleware/validate.ts)
  to request bodies and query parameters where wired.
- The common success envelope is:

  ```json
  {
    "data": { "example": "value" },
    "error": null
  }
  ```

- Paginated endpoints can include `meta`, conventionally containing `total`, `page`, and
  `pageSize`.
- The common error envelope is:

  ```json
  {
    "data": null,
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Invalid request body",
      "details": {}
    }
  }
  ```

### Error behavior

The common handler in [`errorHandler.ts`](../../apps/mera-driver-api/src/middleware/errorHandler.ts)
currently handles these cases:

| Situation | Expected/current behavior |
|---|---|
| Missing or invalid bearer token | `401 UNAUTHORIZED` |
| Missing permission | `403 FORBIDDEN` |
| Resource not found / unknown route | `404 NOT_FOUND` |
| Zod body/query validation failure | `422 VALIDATION_ERROR` with validation details |
| Prisma unique-constraint conflict | `409 CONFLICT` |
| Custom service/workflow failure | The status and code supplied through `HttpError` |
| Unhandled error | `500 SERVER_ERROR`; response hides internal details and logs the error |
| Rate-limited public lookup | `429 RATE_LIMITED` or `LOCATION_RATE_LIMIT`, with `Retry-After` on the shared limiter |
| Payment provider failure | Provider flows can return `502` or `503` with specific codes |

**Contract gap:** the global handler does not explicitly normalize errors from Express JSON body
parsing. The parser is registered before the handler, while the handler only recognizes `HttpError`
and Prisma unique conflicts before falling back to 500. Malformed JSON should be verified and
normalized to a documented `400 BAD_REQUEST`; do not assume it follows the normal validation
`422` path.

Not every operation currently documents every possible status/error response in OpenAPI. Do not
assume the list above is an exhaustive per-endpoint contract.

## Current endpoint map

This is a route-family map, not a replacement for a generated operation-by-operation inventory.
The existing [`API.md`](API.md) contains method/path/guard tables for many older routes, but its
generated date and route count are stale relative to current source.

| Family | Representative methods and paths | Status / notes |
|---|---|---|
| Auth | `POST /auth/otp/request`, `/auth/otp/verify`, `/auth/password/login`, `/auth/password/forgot`, `/auth/password/reset`, `/auth/refresh`, `/auth/logout`; `GET /auth/google`, `/auth/google/callback` | Implemented flows; `GET /auth/google/failure` is also mounted but absent from the current OpenAPI operation list. |
| RBAC and users | `GET/POST /rbac/roles`; `PATCH/DELETE /rbac/roles/:id`; `PUT /rbac/roles/:id/permissions`; `GET/POST/PATCH/DELETE /rbac/users...`; bootstrap, audit logs, impersonation, sessions and permission overrides | Implemented permission-gated administrative operations. |
| Customers | `GET/POST /customers`, `PATCH/DELETE /customers/:id`, link/unlink/create-user; `GET/PATCH /customers/me`, `GET /customers/me/bookings` | Staff CRUD plus ownership-based self-service. |
| Drivers and KYC | `GET/POST /drivers`, `PATCH/DELETE /drivers/:id`, documents, status, user linking, KYC assignment/checklist; `/drivers/me...` | More route handlers exist than the OpenAPI list currently describes, including applications, DL verification, detail/search, PDFs/reports and pill-review operations. |
| Vehicles and attendance | CRUD at `/vehicles...`, `/attendance...` | Permission-gated domain routes. |
| Trips | CRUD under `/trips/trip-types`, `/trips/bookings`, `/trips/driver-locations`, `/trips/cancellation-reasons`, and `/trips/pricing` | Request validation and permissions apply where declared in each router. |
| Workflow / booking journey | 37 explicit handlers under `/workflow`, including `GET /workflow/catalog`, `POST /workflow/public/candidates`, customer quote/candidates/bookings, driver availability/trips, dispatch and accounts | These routes are **not represented in the generated OpenAPI document**. They need complete request/response/error contracts. |
| Masters | CRUD under `/masters/*`, plus onboarding options and dynamically mounted lookup lists | Several app-mounted lookup routes and onboarding options are missing from the OpenAPI inventory. |
| Payments and reports | `GET /payments`, `GET /reports`; payment order/confirmation routes under `/workflow`; `POST /payments/provider/webhook` | The list endpoints are permission-gated **stubs returning empty arrays**. Some booking/registration payment flows are implemented separately. |
| Public/operational | `GET /health`, `GET /location/search`, `GET /dashboard`, authenticated `/uploads/*`, provider webhook | App-level routes are not all covered by the generated OpenAPI document. |
| Partners and support/content | Partner/company management APIs are not implemented. `POST /workflow/support` accepts a support submission, but there is no complete support-case administration API. | Do not describe these modules as complete APIs. |

### Important current-source routes absent from the OpenAPI list

The current [`workflow.routes.ts`](../../apps/mera-driver-api/src/routes/workflow.routes.ts) contains
37 route handlers, including:

- `GET /workflow/catalog`
- `POST /workflow/public/candidates`
- `GET /workflow/customer/dashboard`
- `POST /workflow/customer/payment-order`
- `POST /workflow/driver/payment-order`
- `POST /workflow/payment-confirm`
- `POST /workflow/customer/quote`
- `POST /workflow/customer/bookings`
- `GET /workflow/customer/bookings`
- `GET /workflow/dispatch`
- `POST /workflow/dispatch/:id/assign`
- `GET /workflow/accounts`
- `POST /workflow/accounts/movements`

Other source-level routes missing from the generated operation list include app-level health,
location lookup, dashboard and webhook operations, `/masters/onboarding-options`, additional
lookup-list mounts, plus newer driver application, verification, report/PDF, resume and review
operations. The exact current inventory should be generated by walking all mounted routers,
including app-level routes and routers created by `makeMasterListRouter`.

## What the verification says about “working”

### Verified in this review

- API unit/in-process tests passed: **702 passed, 1 skipped**.
- Nx build target completed successfully.
- Current OpenAPI generator ran and emitted an OpenAPI 3.1 document with 147 operations and
  94 paths.
- Source inspection confirms server-side authentication, permission checks, ownership checks,
  request validation, common error handling, and payment signature verification are present.

### Not verified / known incomplete

- No live server was started for a full endpoint smoke test.
- No production or staging URL, PostgreSQL instance, or provider credentials were tested.
- API tests use mocked Prisma, so they do not prove migrations, DB connectivity, query behavior
  against real data, or end-to-end workflows.
- The one skipped API test is reported by the test runner; skipped behavior is not verified.
- `GET /payments` and `GET /reports` are stubs. The architecture review also found the Reports UI
  uses local/in-memory data rather than a real reports API.
- Partner/company management and a complete support/content API surface remain unimplemented.
- The source and OpenAPI coverage counts do not match; the available `API.md` count is from
  2026-10-17.

## Industry-standard assessment

### Good foundations already present

- Express router/service separation and Prisma data access.
- Zod validation for many request bodies and query parameters.
- OpenAPI 3.1 generation from schemas and Swagger UI.
- A consistent JSON envelope and centralized handling for common application/Prisma errors.
- Short-lived JWT access tokens; database-backed permission checks.
- Record ownership/assignment checks for portal and scoped staff operations.
- Tests covering many routes, auth, permissions, workflow and provider behaviors.
- Webhook signature verification and backend-side payment confirmation checks.

### Gaps to close before calling the API industry-grade

1. **Document all mounted endpoints.** The current OpenAPI document omits workflow and other
   current operations. Add OpenAPI entries for every mounted method/path, including body/query
   schemas, success responses, security requirements, and errors.
2. **Add a coverage gate.** CI should compare mounted route operations to documented OpenAPI
   operations and fail on an undocumented route, except for an explicit allowlist such as static
   files or intentionally private infrastructure endpoints.
3. **Choose and document versioning.** Routes currently live at the root. Define a compatibility
   policy and a migration approach before external clients rely on the current paths; OpenAPI
   metadata version `1.0.0` is not a substitute for URL/API compatibility policy.
4. **Normalize malformed-request errors.** Convert invalid JSON and unsupported content types to
   stable 4xx JSON envelopes instead of letting parser errors fall through as generic 500s.
5. **Complete API response/error schemas.** Add per-operation response schemas and document actual
   status codes/codes, including auth, permission, not-found, conflict, validation, throttling and
   provider failures.
6. **Make throttling distributed where needed.** The public rate limiters use process-local
   in-memory maps. That is bounded for a single process, but counters do not coordinate across
   multiple API instances and reset on restart; use a shared store or edge/API gateway for
   horizontally scaled production.
7. **Separate liveness and readiness.** `/health` currently returns a static `ok` response. Add a
   readiness check for critical dependencies (without exposing secrets) if deployment orchestration
   needs to know whether the API can serve requests.
8. **Finish incomplete modules and E2E validation.** Implement real reports/account listing
   behavior where required, close the partner/support API scope, and test with a disposable real
   database plus provider/webhook contract tests.
9. **Keep the endpoint inventory current.** Regenerate [`API.md`](API.md) from live router
   registrations and update it alongside route changes.

### Verdict

**Architecture: partially industry-aligned, not yet fully industry-grade.** Authentication,
authorization, validation, layering, OpenAPI generation and automated tests are good foundations.
The biggest blockers are incomplete documentation/coverage, root-level unversioned paths, an
incomplete error contract, process-local rate limiting, and business modules that are explicitly
stubs or unimplemented. The passing suite is encouraging, but a production readiness claim needs
live integration checks and the gaps above addressed.

## Useful references

- Existing endpoint tables and permission guards: [`API.md`](API.md).
- Test commands and known failures: [`TESTING.md`](TESTING.md).
- Scope, permissions and planned modules: [`PLANNING.md`](PLANNING.md).
- Current architecture review and module gaps: [`ARCHITECTURE.md`](ARCHITECTURE.md).
- API assembly: [`app.ts`](../../apps/mera-driver-api/src/app.ts).
- OpenAPI schemas and generator: [`openapi.ts`](../../apps/mera-driver-api/src/openapi.ts).
- Request validation and error handling:
  [`validate.ts`](../../apps/mera-driver-api/src/middleware/validate.ts),
  [`errorHandler.ts`](../../apps/mera-driver-api/src/middleware/errorHandler.ts).
