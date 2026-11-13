# mera-driver database

PostgreSQL database `mera_driver`, schema `apps/mera-driver-api/prisma/schema.prisma` (26 models,
4 enums), 12 migrations. Conventions (Prisma pin, generated client, immutable migrations,
`down.sql`, local Postgres): `docs/msd/DATABASE.md` §0 applies here too, with the client in
`apps/mera-driver-api/src/generated/prisma-client`.

> **Generated tables** from `schema.prisma` on 2026-10-17. Regenerate after schema changes.

## 1. Administration

| Model (table) | Columns | Relations | Unique / indexes |
|---|---|---|---|
| User | 11 | roles -> UserRole[]; refreshSessions -> RefreshSession[]; loginHistory -> LoginHistory[]; auditLogsAsActor -> AuditLog[]; impersonationsAsSuperAdmin -> ImpersonationSession[]; impersonationsAsTarget -> ImpersonationSession[]; permissionOverrides -> UserPermissionOverride[]; driver -> Driver; customer -> Customer; assignedKycDrivers -> Driver[] | index(status) |
| Role | 9 | permissions -> RolePermission[]; users -> UserRole[]; dashboardWidgets -> RoleDashboardWidget[] | index(isActive) |
| Permission | 7 | roles -> RolePermission[]; userOverrides -> UserPermissionOverride[] | index(menuKey); index(action) |
| UserPermissionOverride | 5 | user -> User; permission -> Permission | unique(userId, permissionId); index(userId) |
| RolePermission | 3 | role -> Role; permission -> Permission | unique(PK roleId, permissionId); index(roleId); index(permissionId) |
| UserRole | 3 | user -> User; role -> Role | unique(PK userId, roleId); index(userId); index(roleId) |
| DashboardWidget | 7 | roles -> RoleDashboardWidget[] | - |
| RoleDashboardWidget | 4 | role -> Role; widget -> DashboardWidget | unique(PK roleId, widgetId); index(roleId); index(widgetId) |
| OtpChallenge | 9 | - | index(identifier, purpose); index(expiresAt) |
| RefreshSession | 10 | user -> User | index(userId); index(expiresAt) |
| AuditLog | 10 | actor -> User | index(actorUserId); index(targetType, targetId); index(createdAt) |
| LoginHistory | 7 | user -> User | index(userId); index(createdAt) |
| ImpersonationSession | 6 | superAdmin -> User; target -> User | index(superAdminUserId); index(targetUserId) |

`User.status` (RBAC-level) and `Driver.accountStatus` (portal login gate) are separate concepts
on separate tables, joined by `Driver.userId`.

## 2. Customers

| Model (table) | Columns | Relations | Unique / indexes |
|---|---|---|---|
| Customer | 23 | user -> User; bookings -> Booking[] | index(verificationStatus); index(accountStatus) |

## 3. Drivers

| Model (table) | Columns | Relations | Unique / indexes |
|---|---|---|---|
| Driver | 73 | user -> User; assignedVerifier -> User; documents -> DriverDocument[] | index(status); index(accountStatus); index(assignedVerifierId) |
| DriverDocument | 10 | driver -> Driver | index(driverId); index(category) |
| AttendanceRecord | 17 | - | index(driverId); index(status) |
| DriverLocation | 11 | - | - |

`AttendanceRecord.driverId` is a plain string and `DriverLocation` stores `driverName`; neither is a
foreign key to `Driver` (gap D-04).

## 4. KYC and verification

KYC data lives on `Driver` (status, verification notes, reviewer assignment and checklist fields
from migration `20260916104135_add_kyc_assignment_and_checklist`) and `DriverDocument`. No separate
KYC case table.

## 5. Bookings and trips

| Model (table) | Columns | Relations | Unique / indexes |
|---|---|---|---|
| TripType | 6 | - | - |
| Booking | 29 | customer -> Customer | index(status); index(customerId) |
| CancellationReason | 8 | - | - |
| FareRule | 16 | - | - |

`Booking` links the customer by `customerId` (since `20260917085354_add_customer_self_service`) but
stores driver and vehicle as names; `FareRule` references vehicle category, trip type and zone by
name (gap B-01).

## 6. Vehicles

| Model (table) | Columns | Relations | Unique / indexes |
|---|---|---|---|
| Vehicle | 20 | - | index(status) |
| VehicleType | 7 | - | - |

`Vehicle.customerId` is an `Int?` with no relation (gap V-01).

## 7. Accounts

No tables (payments and reports are stubs).

## 8. Partners (vendors and companies): proposed, not built

| Model | Key fields | Notes |
|---|---|---|
| `Vendor` | `userId` (unique, like `Driver.userId`), business and contact fields, GST, PAN, `verificationStatus`, `accountStatus` | one vendor, many drivers via `Driver.vendorId` |
| `VendorDocument` | `vendorId`, type, file | cascade delete |
| `Company`, `CompanyUser` | legal and contact fields, statuses; `CompanyUser(companyId, userId unique, isCompanyAdmin)` | company staff accounts |
| `Requirement` | `customerId` or `companyId` (exactly one), driver type, vehicle type, zone, quantity, dates, status `New/Assigned/Fulfilled/Cancelled`, `assignedToUserId` | backs the `/ride/*` flow |
| `Assignment` | `driverId`; `companyId`, `customerId` or `requirementId` (exactly one); status `Active/Ended/Cancelled`; `assignedBy`, dates | append-only history; at most one Active per driver |
| `Driver` additions | `vendorId`, `sourceType` values `VENDOR`, `MARKETING`, `OTHER` | source never overwritten by assignments |

## 9. Support and content

No tables yet.

## 10. Masters

| Model (table) | Columns | Relations | Unique / indexes |
|---|---|---|---|
| MasterListItem | 6 | - | unique(category, name); index(category) |
| ServiceZone | 16 | - | - |

## 11. Platform: enums and migrations

| Enum | Values |
|---|---|
| `UserStatus` | active, inactive, blocked |
| `PermissionAction` | view, create, edit, delete, export, import, approve, reject, upload, download, print, assign, restore, permanent_delete, status_change, custom |
| `OtpPurpose` | login, signup, change_phone, change_email, password_reset |
| `LoginMethod` | otp_email, otp_phone, google, password |

Migrations (oldest first): RBAC and auth tables, impersonation cleanup, phase 1 business models,
master data, multi-role auth, password login, driver self-service, onboarding progress, nested
sub-step progress, driver account status, KYC assignment and checklist, customer self-service.
