# Command: /new-endpoint

Builds a new API endpoint in msd-api or mera-driver-api.

## Pipeline

1. **skylabs-abhi** — API implementation
   - Write OpenAPI spec first (path, method, auth, request schema, response schema, error cases)
   - Register Zod schema with `zod-to-openapi`
   - Implement Express route in `apps/<app>-api/src/routes/`
   - Implement service method in `apps/<app>-api/src/services/`
   - Apply `authenticate` middleware; apply `requireRole(...)` if role-gated
   - Apply `validate(Schema)` middleware on POST/PUT/PATCH
   - All responses follow `{ data, error, meta }` shape
   - Verify docs appear at `/docs`

2. **skylabs-dev** — Integration tests
   - Supertest tests in `apps/<app>-api/src/routes/<resource>.test.ts`
   - Cover: success (200/201), unauthenticated (401), wrong role (403), validation error (422), not found (404)
   - Run: `npx nx run <app>-api:test`

## Usage

```
/new-endpoint [app: msd | mera-driver] [describe what the endpoint does]
```

### Examples
```
/new-endpoint msd GET /deals — list all active deals, paginated, filterable by category
/new-endpoint msd POST /auth/otp/send — send OTP to phone or email
/new-endpoint mera-driver POST /bookings — create a new driver booking for a customer
/new-endpoint mera-driver GET /drivers/:id — get driver profile with ratings and trip count
```

## Constraints
- msd-api and mera-driver-api are completely separate — never share routes, schemas, or DB
- OpenAPI spec is written and reviewed before any route code
- Auth middleware is never skipped on protected endpoints
- Rate limiting on all public endpoints (no-auth required ones)
