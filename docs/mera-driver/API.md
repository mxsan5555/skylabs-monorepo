# mera-driver API

`apps/mera-driver-api`, routes at the root (local `http://localhost:3334`, no `/api/v1`), docs at
`/docs`. Envelope, auth and validation conventions match `docs/msd/API.md` §0.

> **Generated tables** on 2026-10-17 from the running Express app (same method as msd). "signed in"
> means a valid token plus an ownership check in the handler (`/drivers/me*`, `/customers/me*`, the
> assigned KYC reviewer). Coverage: 149 routes, 147 in the OpenAPI document (`auth` and `health`
> missing).

## 1. Administration

| Method | Path | Guard |
|---|---|---|
| GET | `/auth/google` | public |
| GET | `/auth/google/callback` | public |
| GET | `/auth/google/failure` | public |
| POST | `/auth/logout` | public |
| POST | `/auth/logout-all` | signed in (own records, or checked in the handler) |
| POST | `/auth/otp/request` | public |
| POST | `/auth/otp/verify` | public |
| POST | `/auth/password/forgot` | public |
| POST | `/auth/password/login` | public |
| POST | `/auth/password/reset` | public |
| POST | `/auth/password/set` | signed in (own records, or checked in the handler) |
| POST | `/auth/refresh` | public |
| GET | `/health` | public |
| GET | `/rbac/audit-logs` | `rbac.audit-logs:view` |
| GET | `/rbac/bootstrap` | signed in (own records, or checked in the handler) |
| GET | `/rbac/dashboard-widgets` | `rbac.roles:view` |
| POST | `/rbac/dashboard-widgets` | `rbac.roles:create` |
| POST | `/rbac/impersonate` | `rbac.users:assign` |
| GET | `/rbac/permissions/catalog` | `rbac.roles:view` |
| GET | `/rbac/roles` | `rbac.roles:view` |
| POST | `/rbac/roles` | `rbac.roles:create` |
| PATCH | `/rbac/roles/:id` | `rbac.roles:edit` |
| DELETE | `/rbac/roles/:id` | `rbac.roles:delete` |
| POST | `/rbac/roles/:id/clone` | `rbac.roles:create` |
| GET | `/rbac/roles/:id/permissions` | `rbac.roles:view` |
| PUT | `/rbac/roles/:id/permissions` | `rbac.roles:edit` |
| PATCH | `/rbac/roles/:id/status` | `rbac.roles:status_change` |
| PUT | `/rbac/roles/:id/widgets` | `rbac.roles:edit` |
| GET | `/rbac/users` | `rbac.users:view` |
| POST | `/rbac/users` | `rbac.users:create` |
| PATCH | `/rbac/users/:id` | `rbac.users:edit` |
| DELETE | `/rbac/users/:id` | `rbac.users:delete` |
| GET | `/rbac/users/:id/login-history` | `rbac.users:view` |
| POST | `/rbac/users/:id/otp/reset` | `rbac.users:edit` |
| GET | `/rbac/users/:id/permission-overrides` | `rbac.users:view` |
| PUT | `/rbac/users/:id/permission-overrides` | `rbac.users:assign` |
| GET | `/rbac/users/:id/permissions/effective` | `rbac.users:view` |
| POST | `/rbac/users/:id/roles/:roleId` | `rbac.users:assign` |
| DELETE | `/rbac/users/:id/roles/:roleId` | `rbac.users:assign` |
| GET | `/rbac/users/:id/sessions` | `rbac.users:view` |
| POST | `/rbac/users/:id/sessions/revoke-all` | `rbac.users:edit` |
| PATCH | `/rbac/users/:id/status` | `rbac.users:status_change` |
| GET | `/rbac/users/me` | signed in (own records, or checked in the handler) |
| PATCH | `/rbac/users/me` | signed in (own records, or checked in the handler) |

## 2. Customers

| Method | Path | Guard |
|---|---|---|
| GET | `/customers` | `customers:view` |
| POST | `/customers` | `customers:create` |
| PATCH | `/customers/:id` | `customers:edit` |
| DELETE | `/customers/:id` | `customers:delete` |
| POST | `/customers/:id/create-user` | `customers:assign` |
| PATCH | `/customers/:id/link-user` | `customers:assign` |
| PATCH | `/customers/:id/unlink-user` | `customers:assign` |
| GET | `/customers/me` | signed in (own records, or checked in the handler) |
| PATCH | `/customers/me` | signed in (own records, or checked in the handler) |
| GET | `/customers/me/bookings` | signed in (own records, or checked in the handler) |

## 3. Drivers

| Method | Path | Guard |
|---|---|---|
| GET | `/attendance` | `attendance:view` |
| POST | `/attendance` | `attendance:create` |
| PATCH | `/attendance/:id` | `attendance:edit` |
| DELETE | `/attendance/:id` | `attendance:delete` |
| GET | `/drivers` | `drivers:view` |
| POST | `/drivers` | `drivers:create` |
| PATCH | `/drivers/:id` | `drivers:edit` |
| DELETE | `/drivers/:id` | `drivers:delete` |
| POST | `/drivers/:id/create-user` | `drivers:assign` |
| GET | `/drivers/:id/documents` | `drivers:view` |
| POST | `/drivers/:id/documents` | `drivers:edit` |
| DELETE | `/drivers/:id/documents/:docId` | `drivers:edit` |
| PATCH | `/drivers/:id/link-user` | `drivers:assign` |
| PATCH | `/drivers/:id/status` | `drivers:status_change` |
| PATCH | `/drivers/:id/unlink-user` | `drivers:assign` |
| GET | `/drivers/available` | `trips.bookings:view` |
| GET | `/drivers/me` | signed in (own records, or checked in the handler) |
| PATCH | `/drivers/me` | signed in (own records, or checked in the handler) |
| GET | `/drivers/me/documents` | signed in (own records, or checked in the handler) |
| POST | `/drivers/me/documents` | signed in (own records, or checked in the handler) |
| DELETE | `/drivers/me/documents/:docId` | signed in (own records, or checked in the handler) |

## 4. KYC and verification

| Method | Path | Guard |
|---|---|---|
| PATCH | `/drivers/:id/assign-verifier` | `drivers:assign` |
| PATCH | `/drivers/:id/kyc-checklist` | signed in (own records, or checked in the handler) |
| GET | `/drivers/assigned-to-me` | `kyc-assignments:view` |
| GET | `/drivers/assigned-to-me/:id` | signed in (own records, or checked in the handler) |

## 5. Bookings and trips

| Method | Path | Guard |
|---|---|---|
| GET | `/trips/bookings` | `trips.bookings:view` |
| POST | `/trips/bookings` | `trips.bookings:create` |
| PATCH | `/trips/bookings/:id` | `trips.bookings:edit` |
| DELETE | `/trips/bookings/:id` | `trips.bookings:delete` |
| GET | `/trips/cancellation-reasons` | `trips.cancellation-reasons:view` |
| POST | `/trips/cancellation-reasons` | `trips.cancellation-reasons:create` |
| PATCH | `/trips/cancellation-reasons/:id` | `trips.cancellation-reasons:edit` |
| DELETE | `/trips/cancellation-reasons/:id` | `trips.cancellation-reasons:delete` |
| GET | `/trips/driver-locations` | `trips.driver-locations:view` |
| POST | `/trips/driver-locations` | `trips.driver-locations:create` |
| PATCH | `/trips/driver-locations/:id` | `trips.driver-locations:edit` |
| DELETE | `/trips/driver-locations/:id` | `trips.driver-locations:delete` |
| GET | `/trips/pricing` | `trips.pricing:view` |
| POST | `/trips/pricing` | `trips.pricing:create` |
| PATCH | `/trips/pricing/:id` | `trips.pricing:edit` |
| DELETE | `/trips/pricing/:id` | `trips.pricing:delete` |
| GET | `/trips/trip-types` | `trips.trip-types:view` |
| POST | `/trips/trip-types` | `trips.trip-types:create` |
| PATCH | `/trips/trip-types/:id` | `trips.trip-types:edit` |
| DELETE | `/trips/trip-types/:id` | `trips.trip-types:delete` |

## 6. Vehicles

| Method | Path | Guard |
|---|---|---|
| GET | `/masters/vehicle-types` | `masters.vehicle-types:view` |
| POST | `/masters/vehicle-types` | `masters.vehicle-types:create` |
| PATCH | `/masters/vehicle-types/:id` | `masters.vehicle-types:edit` |
| DELETE | `/masters/vehicle-types/:id` | `masters.vehicle-types:delete` |
| GET | `/vehicles` | `vehicles:view` |
| POST | `/vehicles` | `vehicles:create` |
| PATCH | `/vehicles/:id` | `vehicles:edit` |
| DELETE | `/vehicles/:id` | `vehicles:delete` |

## 7. Accounts

| Method | Path | Guard |
|---|---|---|
| GET | `/payments` | `payments:view` |
| GET | `/reports` | `reports:view` |

Both are stubs that return `[]` behind the permission gate.

## 8. Partners (vendors and companies)

No routes yet (proposed menu keys `vendors`, `companies`, `requirements`, `assignments`).

## 9. Support and content

No routes yet.

## 10. Masters

| Method | Path | Guard |
|---|---|---|
| GET | `/masters/driver-types` | `masters.driver-types:view` |
| POST | `/masters/driver-types` | `masters.driver-types:create` |
| PATCH | `/masters/driver-types/:id` | `masters.driver-types:edit` |
| DELETE | `/masters/driver-types/:id` | `masters.driver-types:delete` |
| GET | `/masters/education` | `masters.education:view` |
| POST | `/masters/education` | `masters.education:create` |
| PATCH | `/masters/education/:id` | `masters.education:edit` |
| DELETE | `/masters/education/:id` | `masters.education:delete` |
| GET | `/masters/eye-visions` | `masters.eye-visions:view` |
| POST | `/masters/eye-visions` | `masters.eye-visions:create` |
| PATCH | `/masters/eye-visions/:id` | `masters.eye-visions:edit` |
| DELETE | `/masters/eye-visions/:id` | `masters.eye-visions:delete` |
| GET | `/masters/health-docs` | `masters.health-docs:view` |
| POST | `/masters/health-docs` | `masters.health-docs:create` |
| PATCH | `/masters/health-docs/:id` | `masters.health-docs:edit` |
| DELETE | `/masters/health-docs/:id` | `masters.health-docs:delete` |
| GET | `/masters/languages` | `masters.languages:view` |
| POST | `/masters/languages` | `masters.languages:create` |
| PATCH | `/masters/languages/:id` | `masters.languages:edit` |
| DELETE | `/masters/languages/:id` | `masters.languages:delete` |
| GET | `/masters/personal-docs` | `masters.personal-docs:view` |
| POST | `/masters/personal-docs` | `masters.personal-docs:create` |
| PATCH | `/masters/personal-docs/:id` | `masters.personal-docs:edit` |
| DELETE | `/masters/personal-docs/:id` | `masters.personal-docs:delete` |
| GET | `/masters/police-docs` | `masters.police-docs:view` |
| POST | `/masters/police-docs` | `masters.police-docs:create` |
| PATCH | `/masters/police-docs/:id` | `masters.police-docs:edit` |
| DELETE | `/masters/police-docs/:id` | `masters.police-docs:delete` |
| GET | `/masters/source-types` | `masters.source-types:view` |
| POST | `/masters/source-types` | `masters.source-types:create` |
| PATCH | `/masters/source-types/:id` | `masters.source-types:edit` |
| DELETE | `/masters/source-types/:id` | `masters.source-types:delete` |
| GET | `/masters/statuses` | `masters.statuses:view` |
| POST | `/masters/statuses` | `masters.statuses:create` |
| PATCH | `/masters/statuses/:id` | `masters.statuses:edit` |
| DELETE | `/masters/statuses/:id` | `masters.statuses:delete` |
| GET | `/masters/zones` | `masters.zones:view` |
| POST | `/masters/zones` | `masters.zones:create` |
| PATCH | `/masters/zones/:id` | `masters.zones:edit` |
| DELETE | `/masters/zones/:id` | `masters.zones:delete` |

## 11. Platform

Adding an endpoint: `docs/ARCHITECTURE.md` §3.4. List, search, detail, document, PDF and export
endpoints must apply the same scope (`PLANNING.md` §11).
