import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PERMISSION_ACTIONS, type PermissionAction } from '@skylabs-monorepo/shared-types';
import { PaginationQuerySchema } from './common.schema';
import { normalizeIdentifier } from '../lib/normalizeIdentifier';

extendZodWithOpenApi(z);

/**
 * `User.phone` is a genuine LOGIN IDENTIFIER (unlike Vendor's business/owner contact phones) —
 * `otp.service.ts`/`auth.service.ts#loginWithIdentifier` only ever look it up by the normalized
 * `+91XXXXXXXXXX` form (see `normalizeIdentifier`, applied at the `/otp/request`+`/otp/verify`
 * boundary). Without this same transform here, a staff user created/edited with a bare
 * `9889259224` would be stored un-normalized, could never match a real login's normalized
 * `+919889259224`, and would silently fall through to "no account" / a brand-new customer
 * signup instead of resolving to this same user. Mirrors `vendor.schema.ts`'s `vendorPhoneSchema`
 * exactly (same transform, same India-mobile regex).
 */
const INDIA_MOBILE_REGEX = /^\+91[6-9]\d{9}$/;
const userPhoneSchema = z
  .string()
  .max(30)
  .transform((v) => (v === '' ? v : normalizeIdentifier(v)))
  .refine((v) => v === '' || INDIA_MOBILE_REGEX.test(v), { message: 'Enter a valid 10-digit mobile number' })
  .optional();

export const PermissionActionSchema = z
  .enum(PERMISSION_ACTIONS as [PermissionAction, ...PermissionAction[]])
  .openapi('PermissionAction');


export const PermissionScopeSchema = z
  .enum(['ALL', 'OWN'])
  .openapi('PermissionScope');
// ─── Roles ───────────────────────────────────────────────────────────────────

export const RoleCreateSchema = z
  .object({
    key: z
      .string()
      .min(2)
      .max(50)
      .regex(/^[a-z][a-z0-9_]*$/, 'key must be a lower_snake_case slug'),
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    isActive: z.boolean().default(true),
  })
  .openapi('RoleCreate');

export const RoleUpdateSchema = RoleCreateSchema.omit({ key: true }).partial().openapi('RoleUpdate');

export const RoleStatusUpdateSchema = z
  .object({
    isActive: z.boolean(),
  })
  .openapi('RoleStatusUpdate');

export const RolePermissionAssignmentSchema = z.object({
  permissionId: z.string().uuid(),
  scope: PermissionScopeSchema,
}).openapi('RolePermissionAssignment');


export const RolePermissionsUpdateSchema = z.object({
  permissions: z.array(RolePermissionAssignmentSchema),
}).openapi('RolePermissionsUpdate');



export const RolePermissionsResponseSchema = z.object({
  permissionId: z.string().uuid(),
  scope: PermissionScopeSchema,
}).array().openapi('RolePermissionsResponse');


export const RoleWidgetsUpdateSchema = z
  .object({
    widgets: z.array(
      z.object({
        widgetId: z.string().uuid(),
        order: z.number().int().min(0),
      }),
    ),
  })
  .openapi('RoleWidgetsUpdate');

// ─── Dashboard widgets ───────────────────────────────────────────────────────

export const DashboardWidgetCreateSchema = z
  .object({
    key: z.string().min(2).max(80),
    title: z.string().min(1).max(150),
    module: z.string().min(1).max(80),
    description: z.string().max(500).optional(),
  })
  .openapi('DashboardWidgetCreate');

// ─── Users ───────────────────────────────────────────────────────────────────

/** `roleKey` filters to users holding that specific `Role.key` (e.g. `vendor`, `customer`,
 *  `admin`) — see `userService.listUsers`'s own doc comment for why this joins through
 *  `UserRole -> Role.key`, never a role name string compare on `User` itself (no such column
 *  exists; a user's roles are a many-to-many, not a scalar field). */
export const UserListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().max(200).optional(),
  roleKey: z.string().max(100).optional(),
});

// A staff user now holds exactly one role — `roleId` is a single required uuid, never an array.
// `.strict()` rejects a payload carrying any unrecognized key (e.g. a stale client still sending
// `roleIds: [...]`) with a 422 instead of silently ignoring it, so a multi-role-shaped payload is
// never quietly accepted.
export const UserCreateSchema = z
  .object({
    name: z.string().min(1).max(150),
    email: z.string().email().optional(),
    phone: userPhoneSchema,
    roleId: z.string().uuid(),
  })
  .strict()
  .openapi('UserCreate');

export const UserUpdateSchema = z
  .object({
    name: z.string().min(1).max(150).optional(),
    email: z.string().email().optional(),
    phone: userPhoneSchema,
  })
  .openapi('UserUpdate');

export const UserStatusUpdateSchema = z
  .object({
    status: z.enum(['active', 'inactive', 'blocked']),
  })
  .openapi('UserStatusUpdate');

/** Atomic single-role replace (`PUT /rbac/users/:id/role`) — the only staff role-change payload
 *  shape; see `user.service.ts#setStaffUserRole`/`replaceUserRole`'s own doc comments. */
export const UserRoleSetSchema = z
  .object({
    roleId: z.string().uuid(),
  })
  .strict()
  .openapi('UserRoleSet');

/** Role Conflicts review resolution (`PUT /rbac/role-conflicts/:id`) — same single-role shape,
 *  but not restricted to internal staff roles (see `resolveAccountRoleConflict`'s doc comment). */
export const RoleConflictResolveSchema = z
  .object({
    roleId: z.string().uuid(),
  })
  .strict()
  .openapi('RoleConflictResolve');

export const ImpersonateRequestSchema = z
  .object({
    targetUserId: z.string().uuid(),
  })
  .openapi('ImpersonateRequest');

export const AuditLogQuerySchema = z.object({
  targetUserId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
