# 00 — API Conventions

Applies to every endpoint in the MSD API. Individual docs only state what differs.

## Stack

- **OpenAPI 3.1**, generated from Zod schemas via `@asteasolutions/zod-to-openapi` — the
  Zod schemas are the single source of truth; the spec is a build artifact served at `/docs`
  (`swagger-ui-express`).
- Express + TypeScript, Prisma, PostgreSQL (database `msd`).

## Base URL & versioning

```
https://api.myspadeal.com/api/v1
```

- Version in the path (`/api/v1`). Breaking changes → `/api/v2`; additive changes don't bump.
- Local dev: `http://localhost:3333/api/v1` (frontend reads `VITE_API_URL`).

## Authentication

- **JWT Bearer** in `Authorization: Bearer <accessToken>`.
- Access token TTL **15 min**; refresh token TTL **30 days**, rotated on use (see 01-auth).
- JWT payload: `{ sub: userId, roles: UserRole[], iat, exp }`.

### Roles

| Role | Who | Notes |
|------|-----|-------|
| `user` | Consumer | Default on signup |
| `partner` | Company owner/manager | **New** — extends the frontend's current role union |
| `admin` | MSD staff | Full moderation + CRUD |
| `marketing` | MSD staff | Content, promotions, categories |
| `sales` | MSD staff | Partner accounts, reporting |

Endpoint auth is annotated as: `public` (no token), `user` (any authenticated),
`partner`, `admin`, etc. A role annotation means *that role or admin* unless stated.
**Every protected endpoint re-checks the role from the JWT server-side** — frontend
guards are UX only.

## IDs

- UUID v7 (time-ordered) primary keys, exposed as strings: `"018f4d2e-..."`.
- Public URL identity for deals/categories/companies uses **slugs** (unique, kebab-case,
  immutable after publish); IDs remain the FK identity.

## Money

- Integer **paise** (smallest unit) + ISO currency code. Never floats.

```json
{ "amount": 249900, "currency": "INR" }   // ₹2,499.00
```

> Frontend migration note: `apps/msd/src/types/index.ts` `Deal.price` is a whole-rupee
> `number` today. When integrating, the frontend converts paise → display via its
> existing `formatINR()` helper (divide by 100).

## Timestamps & dates

- Timestamps: ISO 8601 UTC — `"2026-07-14T09:30:00Z"` (`createdAt`, `updatedAt` on every entity).
- Calendar dates (booking dates): `"2026-07-14"` (date-only, no timezone games).
- Times of day (slots): `"14:30"` 24h local to the location.

## Standard error envelope

All non-2xx responses:

```json
{
  "error": {
    "code": "DEAL_NOT_FOUND",
    "message": "Deal with id 018f... does not exist.",
    "details": [
      { "field": "pricingPlanId", "issue": "required" }
    ]
  }
}
```

- `code`: stable machine-readable SCREAMING_SNAKE string (documented per endpoint).
- `details`: present only for validation errors (`422`), one entry per failed field
  (produced from the Zod issue list).

| HTTP | Meaning |
|------|---------|
| 400 | Malformed request (bad JSON, bad UUID) |
| 401 | Missing/expired/invalid token |
| 403 | Authenticated but role/ownership forbids |
| 404 | Resource not found (or not visible to caller) |
| 409 | State conflict (e.g. cancelling a completed order) |
| 422 | Zod validation failure |
| 429 | Rate limited |
| 500 | Unexpected — never leaks internals |

## Pagination

Two styles; each endpoint documents which it uses:

- **Offset** (admin/partner tables, small sets): `?page=1&pageSize=20` →
  ```json
  { "items": [], "total": 143, "page": 1, "pageSize": 20 }
  ```
  Mirrors the frontend's existing `Paginated<T>` type.
- **Cursor** (consumer feeds, search): `?limit=20&cursor=<opaque>` →
  ```json
  { "items": [], "nextCursor": "eyJpZCI6...", "hasMore": true }
  ```

## Standard list query params

| Param | Type | Notes |
|-------|------|-------|
| `sort` | string enum | Per-endpoint, e.g. `popular \| rating \| price-asc \| price-desc \| distance` (mirrors frontend `DealSort`) |
| `page`, `pageSize` | int | Offset style, `pageSize` max 100 |
| `limit`, `cursor` | int, string | Cursor style, `limit` max 50 |
| `include` | csv | Opt-in relations, e.g. `?include=pricingPlans,media` |

## Status / soft-delete conventions

- Entities with a lifecycle carry a `status` enum (documented per entity) — never boolean flags.
- Nothing is hard-deleted if referenced by an order: use `archived` status.
- List endpoints return only "visible" statuses to consumers; partners/admins see all their own.

## Media

- `MediaAsset` (shared shape used by companies, deals, reviews, tickets):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | uuid | ✔ | |
| `url` | string | ✔ | CDN URL |
| `alt` | string | ✔ | Accessibility text — required, WCAG |
| `kind` | enum | ✔ | `image \| video` |
| `width`, `height` | int | ✔ | For layout stability |
| `sortOrder` | int | ✔ | Gallery ordering |

- Upload flow: `POST /media/uploads` returns a presigned URL + `mediaId`; client uploads
  directly; entity endpoints then reference `mediaId`.

## Rate limiting

- Public search/browse: 60 req/min/IP. Auth (OTP request): 5 req/10 min/identifier.
- `429` with `Retry-After` header.

## Zod schema naming

`<Entity><Action>Schema` — e.g. `DealCreateSchema`, `DealUpdateSchema`, `DealResponseSchema`,
`DealListQuerySchema`. Response schemas are the OpenAPI components; docs below reference
these names.

## Open questions

- [ ] Custom domain + gateway (`api.myspadeal.com`) vs path on the web host — infra decision.
- [ ] UUID v7 needs pg 17 or app-side generation — confirm Prisma setup.
- [ ] Media storage: S3-compatible (Cloudflare R2 free tier fits the "no premium services" rule).
