import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  OtpRequestSchema,
  OtpVerifySchema,
  RefreshRequestSchema,
  LogoutRequestSchema,
  TokenPairResponseSchema,
  PasswordLoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  SetPasswordSchema,
} from './schemas/auth.schema';
import {
  CreateRoleSchema,
  UpdateRoleSchema,
  CloneRoleSchema,
  SetRoleStatusSchema,
  SetRolePermissionsSchema,
  SetRoleWidgetsSchema,
  CreateDashboardWidgetSchema,
  CreateUserSchema,
  UpdateUserSchema,
  SetUserStatusSchema,
  ImpersonateSchema,
  SetUserPermissionOverridesSchema,
} from './schemas/rbac.schema';
import {
  CreateCustomerSchema,
  UpdateCustomerSchema,
  CreateDriverSchema,
  UpdateDriverSchema,
  CreateVehicleSchema,
  UpdateVehicleSchema,
  CreateAttendanceSchema,
  UpdateAttendanceSchema,
  LinkDriverToUserSchema,
  SetDriverStatusSchema,
} from './schemas/business.schema';
import { UpdateOwnDriverSchema } from './schemas/driverSelf.schema';
import {
  CreateTripTypeSchema,
  UpdateTripTypeSchema,
  CreateBookingSchema,
  UpdateBookingSchema,
  CreateDriverLocationSchema,
  UpdateDriverLocationSchema,
  CreateCancellationReasonSchema,
  UpdateCancellationReasonSchema,
  CreateFareRuleSchema,
  UpdateFareRuleSchema,
} from './schemas/trips.schema';
import {
  CreateMasterListItemSchema,
  UpdateMasterListItemSchema,
  CreateVehicleTypeSchema,
  UpdateVehicleTypeSchema,
  CreateServiceZoneSchema,
  UpdateServiceZoneSchema,
} from './schemas/masters.schema';

const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

const ErrorSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  })
  .openapi('ErrorObject');

function envelope(dataSchema: z.ZodTypeAny) {
  return z.object({
    data: dataSchema.nullable(),
    error: ErrorSchema.nullable(),
    meta: z.object({ total: z.number().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional(),
  });
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/auth/otp/request',
  summary: 'Request a one-time password for login/signup/change flows',
  request: { body: { content: { 'application/json': { schema: OtpRequestSchema } } } },
  responses: {
    200: { description: 'OTP dispatched (same response regardless of whether the identifier exists)', content: { 'application/json': { schema: envelope(z.object({ message: z.string() })) } } },
    422: { description: 'Validation error', content: { 'application/json': { schema: envelope(z.null()) } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/otp/verify',
  summary: 'Verify an OTP and issue a JWT pair',
  request: { body: { content: { 'application/json': { schema: OtpVerifySchema } } } },
  responses: {
    200: { description: 'JWT pair issued', content: { 'application/json': { schema: envelope(TokenPairResponseSchema) } } },
    422: { description: 'Invalid or expired OTP', content: { 'application/json': { schema: envelope(z.null()) } } },
  },
});

registry.registerPath({
  method: 'get',
  path: '/auth/google',
  summary: 'Redirect to Google OAuth consent screen',
  responses: { 302: { description: 'Redirect to Google' } },
});

registry.registerPath({
  method: 'get',
  path: '/auth/google/callback',
  summary: 'Google OAuth callback — upserts user, issues JWT pair',
  responses: {
    200: { description: 'JWT pair issued', content: { 'application/json': { schema: envelope(TokenPairResponseSchema) } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/refresh',
  summary: 'Rotate the opaque refresh token',
  request: { body: { content: { 'application/json': { schema: RefreshRequestSchema } } } },
  responses: {
    200: { description: 'New token pair', content: { 'application/json': { schema: envelope(z.object({ accessToken: z.string(), refreshToken: z.string() })) } } },
    401: { description: 'Invalid, expired, or replayed refresh token', content: { 'application/json': { schema: envelope(z.null()) } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/logout',
  summary: 'Revoke a single refresh session',
  request: { body: { content: { 'application/json': { schema: LogoutRequestSchema } } } },
  responses: { 200: { description: 'Logged out', content: { 'application/json': { schema: envelope(z.object({ message: z.string() })) } } } },
});

registry.registerPath({
  method: 'post',
  path: '/auth/logout-all',
  summary: 'Revoke every active refresh session for the caller',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Logged out everywhere', content: { 'application/json': { schema: envelope(z.object({ message: z.string() })) } } } },
});

// ---------------------------------------------------------------------------
// Password auth — additive alongside OTP/Google
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/auth/password/login',
  summary: 'Log in with identifier + password (issued alongside OTP/Google, same JWT pair)',
  request: { body: { content: { 'application/json': { schema: PasswordLoginSchema } } } },
  responses: {
    200: { description: 'JWT pair issued', content: { 'application/json': { schema: envelope(TokenPairResponseSchema) } } },
    401: { description: 'Invalid identifier or password', content: { 'application/json': { schema: envelope(z.null()) } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/password/forgot',
  summary: 'Request a password-reset code (reuses the OTP challenge machinery, purpose=password_reset)',
  request: { body: { content: { 'application/json': { schema: ForgotPasswordSchema } } } },
  responses: { 200: { description: 'Reset code dispatched (same response regardless of whether the identifier exists)', content: { 'application/json': { schema: envelope(z.object({ message: z.string() })) } } } },
});

registry.registerPath({
  method: 'post',
  path: '/auth/password/reset',
  summary: 'Verify the password-reset code and set a new password',
  request: { body: { content: { 'application/json': { schema: ResetPasswordSchema } } } },
  responses: {
    200: { description: 'Password reset', content: { 'application/json': { schema: envelope(z.object({ message: z.string() })) } } },
    422: { description: 'Invalid or expired code', content: { 'application/json': { schema: envelope(z.null()) } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/password/set',
  summary: "Change the caller's own password (verifies currentPassword if one is already set)",
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: SetPasswordSchema } } } },
  responses: { 200: { description: 'Password updated', content: { 'application/json': { schema: envelope(z.object({ message: z.string() })) } } } },
});

// ---------------------------------------------------------------------------
// RBAC
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/rbac/bootstrap',
  summary: 'Resolve the caller\'s roles, permissions, menu, and dashboard widgets',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Bootstrap payload', content: { 'application/json': { schema: envelope(z.unknown()) } } } },
});

registry.registerPath({
  method: 'get',
  path: '/rbac/roles',
  summary: 'List roles',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Role list', content: { 'application/json': { schema: envelope(z.array(z.unknown())) } } } },
});

registry.registerPath({
  method: 'post',
  path: '/rbac/roles',
  summary: 'Create a role',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: CreateRoleSchema } } } },
  responses: { 201: { description: 'Role created', content: { 'application/json': { schema: envelope(z.unknown()) } } } },
});

registry.registerPath({
  method: 'patch',
  path: '/rbac/roles/{id}',
  summary: 'Update a role',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: UpdateRoleSchema } } },
  },
  responses: { 200: { description: 'Role updated', content: { 'application/json': { schema: envelope(z.unknown()) } } } },
});

registry.registerPath({
  method: 'delete',
  path: '/rbac/roles/{id}',
  summary: 'Delete a role',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Role deleted', content: { 'application/json': { schema: envelope(z.object({ id: z.string().uuid() })) } } } },
});

registry.registerPath({
  method: 'post',
  path: '/rbac/roles/{id}/clone',
  summary: 'Clone a role under a new key/name',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: CloneRoleSchema } } },
  },
  responses: { 201: { description: 'Role cloned', content: { 'application/json': { schema: envelope(z.unknown()) } } } },
});

registry.registerPath({
  method: 'patch',
  path: '/rbac/roles/{id}/status',
  summary: "Change a role's active status",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: SetRoleStatusSchema } } },
  },
  responses: { 200: { description: 'Role status updated', content: { 'application/json': { schema: envelope(z.unknown()) } } } },
});

registry.registerPath({
  method: 'put',
  path: '/rbac/roles/{id}/permissions',
  summary: "Replace a role's permission grants",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: SetRolePermissionsSchema } } },
  },
  responses: { 200: { description: 'Permissions set', content: { 'application/json': { schema: envelope(z.array(z.unknown())) } } } },
});

registry.registerPath({
  method: 'get',
  path: '/rbac/permissions/catalog',
  summary: 'Full menu x action permission matrix',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Permission catalog', content: { 'application/json': { schema: envelope(z.array(z.unknown())) } } } },
});

registry.registerPath({
  method: 'get',
  path: '/rbac/roles/{id}/permissions',
  summary: "Get a role's current permission grants (flat permissionIds)",
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Permission ids', content: { 'application/json': { schema: envelope(z.object({ permissionIds: z.array(z.string().uuid()) })) } } } },
});

registry.registerPath({
  method: 'put',
  path: '/rbac/roles/{id}/widgets',
  summary: "Replace a role's dashboard widget grants",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: SetRoleWidgetsSchema } } },
  },
  responses: { 200: { description: 'Widgets set', content: { 'application/json': { schema: envelope(z.array(z.unknown())) } } } },
});

registry.registerPath({
  method: 'get',
  path: '/rbac/dashboard-widgets',
  summary: 'List dashboard widgets catalog',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Widget list', content: { 'application/json': { schema: envelope(z.array(z.unknown())) } } } },
});

registry.registerPath({
  method: 'post',
  path: '/rbac/dashboard-widgets',
  summary: 'Create a dashboard widget',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: CreateDashboardWidgetSchema } } } },
  responses: { 201: { description: 'Widget created', content: { 'application/json': { schema: envelope(z.unknown()) } } } },
});

registry.registerPath({
  method: 'get',
  path: '/rbac/users',
  summary: 'List users',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'User list', content: { 'application/json': { schema: envelope(z.array(z.unknown())) } } } },
});

registry.registerPath({
  method: 'post',
  path: '/rbac/users',
  summary: 'Create a user',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: CreateUserSchema } } } },
  responses: { 201: { description: 'User created', content: { 'application/json': { schema: envelope(z.unknown()) } } } },
});

registry.registerPath({
  method: 'get',
  path: '/rbac/users/me',
  summary: "Get the caller's own profile (any authenticated user)",
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Own user profile', content: { 'application/json': { schema: envelope(z.unknown()) } } } },
});

registry.registerPath({
  method: 'patch',
  path: '/rbac/users/me',
  summary: "Update the caller's own profile (name/email/phone — any authenticated user)",
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: UpdateUserSchema } } } },
  responses: { 200: { description: 'Own user profile updated', content: { 'application/json': { schema: envelope(z.unknown()) } } } },
});

registry.registerPath({
  method: 'patch',
  path: '/rbac/users/{id}',
  summary: 'Update a user',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: UpdateUserSchema } } },
  },
  responses: { 200: { description: 'User updated', content: { 'application/json': { schema: envelope(z.unknown()) } } } },
});

registry.registerPath({
  method: 'delete',
  path: '/rbac/users/{id}',
  summary: 'Soft-delete a user',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'User deleted', content: { 'application/json': { schema: envelope(z.object({ id: z.string().uuid() })) } } } },
});

registry.registerPath({
  method: 'post',
  path: '/rbac/users/{id}/roles/{roleId}',
  summary: 'Assign a role to a user',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid(), roleId: z.string().uuid() }) },
  responses: { 200: { description: 'Role assigned', content: { 'application/json': { schema: envelope(z.unknown()) } } } },
});

registry.registerPath({
  method: 'delete',
  path: '/rbac/users/{id}/roles/{roleId}',
  summary: 'Remove a role from a user',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid(), roleId: z.string().uuid() }) },
  responses: { 200: { description: 'Role removed', content: { 'application/json': { schema: envelope(z.unknown()) } } } },
});

registry.registerPath({
  method: 'patch',
  path: '/rbac/users/{id}/status',
  summary: 'Change a user\'s status',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: SetUserStatusSchema } } },
  },
  responses: { 200: { description: 'User updated', content: { 'application/json': { schema: envelope(z.unknown()) } } } },
});

registry.registerPath({
  method: 'post',
  path: '/rbac/users/{id}/sessions/revoke-all',
  summary: 'Revoke every active refresh session for a user',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Sessions revoked', content: { 'application/json': { schema: envelope(z.object({ message: z.string() })) } } } },
});

registry.registerPath({
  method: 'post',
  path: '/rbac/users/{id}/otp/reset',
  summary: 'Invalidate a user\'s pending OTP challenges',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Pending OTPs invalidated', content: { 'application/json': { schema: envelope(z.object({ message: z.string() })) } } } },
});

registry.registerPath({
  method: 'get',
  path: '/rbac/users/{id}/login-history',
  summary: "List a user's login history",
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Login history', content: { 'application/json': { schema: envelope(z.array(z.unknown())) } } } },
});

registry.registerPath({
  method: 'get',
  path: '/rbac/users/{id}/sessions',
  summary: "List a user's active sessions",
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Session list', content: { 'application/json': { schema: envelope(z.array(z.unknown())) } } } },
});

registry.registerPath({
  method: 'get',
  path: '/rbac/users/{id}/permissions/effective',
  summary: "A user's effective permission set (role-derived grants layered with their overrides)",
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Effective permissions', content: { 'application/json': { schema: envelope(z.object({ permissions: z.array(z.string()) })) } } } },
});

registry.registerPath({
  method: 'get',
  path: '/rbac/users/{id}/permission-overrides',
  summary: "A user's current permission override rows, split into grant/revoke permissionId lists",
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Override lists', content: { 'application/json': { schema: envelope(z.object({ grants: z.array(z.string().uuid()), revokes: z.array(z.string().uuid()) })) } } } },
});

registry.registerPath({
  method: 'put',
  path: '/rbac/users/{id}/permission-overrides',
  summary: "Replace a user's permission overrides",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: SetUserPermissionOverridesSchema } } },
  },
  responses: {
    200: { description: 'Overrides saved', content: { 'application/json': { schema: envelope(z.object({ grants: z.array(z.string().uuid()), revokes: z.array(z.string().uuid()) })) } } },
    422: { description: 'Contradictory or invalid permissionIds', content: { 'application/json': { schema: envelope(z.null()) } } },
  },
});

registry.registerPath({
  method: 'get',
  path: '/rbac/audit-logs',
  summary: 'List audit logs, optionally filtered by targetUserId',
  security: [{ bearerAuth: [] }],
  request: { query: z.object({ targetUserId: z.string().uuid().optional() }) },
  responses: { 200: { description: 'Audit log list', content: { 'application/json': { schema: envelope(z.array(z.unknown())) } } } },
});

registry.registerPath({
  method: 'post',
  path: '/rbac/impersonate',
  summary: 'Issue a short-lived "Login As" preview token (requires a SuperAdmin-flagged role)',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: ImpersonateSchema } } } },
  responses: {
    200: { description: 'Preview token issued', content: { 'application/json': { schema: envelope(z.object({ previewToken: z.string() })) } } },
    403: { description: 'Caller is not SuperAdmin-flagged', content: { 'application/json': { schema: envelope(z.null()) } } },
  },
});

// ---------------------------------------------------------------------------
// Business module CRUD (Phase 1) — list/create/update/delete per module,
// registered generically since every module follows the identical shape.
// ---------------------------------------------------------------------------

function registerCrudPaths(basePath: string, label: string, createSchema: z.ZodTypeAny, updateSchema: z.ZodTypeAny) {
  registry.registerPath({
    method: 'get',
    path: basePath,
    summary: `List ${label}`,
    security: [{ bearerAuth: [] }],
    responses: { 200: { description: `${label} list`, content: { 'application/json': { schema: envelope(z.array(z.unknown())) } } } },
  });
  registry.registerPath({
    method: 'post',
    path: basePath,
    summary: `Create a ${label} record`,
    security: [{ bearerAuth: [] }],
    request: { body: { content: { 'application/json': { schema: createSchema } } } },
    responses: { 201: { description: `${label} created`, content: { 'application/json': { schema: envelope(z.unknown()) } } } },
  });
  registry.registerPath({
    method: 'patch',
    path: `${basePath}/{id}`,
    summary: `Update a ${label} record`,
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string().uuid() }), body: { content: { 'application/json': { schema: updateSchema } } } },
    responses: { 200: { description: `${label} updated`, content: { 'application/json': { schema: envelope(z.unknown()) } } } },
  });
  registry.registerPath({
    method: 'delete',
    path: `${basePath}/{id}`,
    summary: `Delete a ${label} record`,
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: `${label} deleted`, content: { 'application/json': { schema: envelope(z.object({ id: z.string().uuid() })) } } } },
  });
}

registerCrudPaths('/customers', 'customer', CreateCustomerSchema, UpdateCustomerSchema);
registerCrudPaths('/drivers', 'driver', CreateDriverSchema, UpdateDriverSchema);
registerCrudPaths('/vehicles', 'vehicle', CreateVehicleSchema, UpdateVehicleSchema);
registerCrudPaths('/attendance', 'attendance record', CreateAttendanceSchema, UpdateAttendanceSchema);
registerCrudPaths('/trips/trip-types', 'trip type', CreateTripTypeSchema, UpdateTripTypeSchema);
registerCrudPaths('/trips/bookings', 'booking', CreateBookingSchema, UpdateBookingSchema);
registerCrudPaths('/trips/driver-locations', 'driver location', CreateDriverLocationSchema, UpdateDriverLocationSchema);
registerCrudPaths('/trips/cancellation-reasons', 'cancellation reason', CreateCancellationReasonSchema, UpdateCancellationReasonSchema);
registerCrudPaths('/trips/pricing', 'fare rule', CreateFareRuleSchema, UpdateFareRuleSchema);

registry.registerPath({
  method: 'get',
  path: '/drivers/{id}/documents',
  summary: "List a driver's uploaded KYC documents",
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Document list', content: { 'application/json': { schema: envelope(z.array(z.unknown())) } } } },
});

registry.registerPath({
  method: 'post',
  path: '/drivers/{id}/documents',
  summary: 'Upload a driver KYC document (multipart/form-data: file + category/type/regNo)',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 201: { description: 'Document stored', content: { 'application/json': { schema: envelope(z.unknown()) } } } },
});

registry.registerPath({
  method: 'delete',
  path: '/drivers/{id}/documents/{docId}',
  summary: 'Delete a driver KYC document',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid(), docId: z.string().uuid() }) },
  responses: { 200: { description: 'Document deleted', content: { 'application/json': { schema: envelope(z.object({ id: z.string().uuid() })) } } } },
});

registry.registerPath({
  method: 'patch',
  path: '/drivers/{id}/link-user',
  summary: 'Link a Driver record to a User account, granting self-service portal access (auto-assigns the driver role)',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: { content: { 'application/json': { schema: LinkDriverToUserSchema } } } },
  responses: {
    200: { description: 'Driver linked', content: { 'application/json': { schema: envelope(z.unknown()) } } },
    409: { description: 'That User is already linked to a Driver', content: { 'application/json': { schema: envelope(z.null()) } } },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/drivers/{id}/status',
  summary: 'Activate or deactivate a Driver account (portal login gate, independent of KYC status)',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: { content: { 'application/json': { schema: SetDriverStatusSchema } } } },
  responses: {
    200: { description: 'Driver account status updated', content: { 'application/json': { schema: envelope(z.unknown()) } } },
    404: { description: 'Driver not found', content: { 'application/json': { schema: envelope(z.null()) } } },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/drivers/{id}/unlink-user',
  summary: 'Unlink a Driver record from its User account',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Driver unlinked', content: { 'application/json': { schema: envelope(z.unknown()) } } } },
});

registry.registerPath({
  method: 'post',
  path: '/drivers/{id}/create-user',
  summary: 'Create and link a User account for this Driver in one step (auto-assigns the driver role) — the only way a Driver gets portal access',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    201: { description: 'User created and linked', content: { 'application/json': { schema: envelope(z.unknown()) } } },
    409: { description: 'Driver already has a linked user account', content: { 'application/json': { schema: envelope(z.null()) } } },
    422: { description: 'Driver has no phone or email on file', content: { 'application/json': { schema: envelope(z.null()) } } },
  },
});

// ---------------------------------------------------------------------------
// Driver self-service (/drivers/me) — ownership-based, not permission-gated.
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/drivers/me',
  summary: "The caller's own Driver record",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Own driver record', content: { 'application/json': { schema: envelope(z.unknown()) } } },
    404: { description: 'Caller has no linked Driver record (code DRIVER_NOT_LINKED)', content: { 'application/json': { schema: envelope(z.null()) } } },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/drivers/me',
  summary: "Update the caller's own Driver record (restricted field set — never status/police-verification fields)",
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: UpdateOwnDriverSchema } } } },
  responses: { 200: { description: 'Updated', content: { 'application/json': { schema: envelope(z.unknown()) } } } },
});

registry.registerPath({
  method: 'get',
  path: '/drivers/me/documents',
  summary: "List the caller's own uploaded KYC documents",
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Document list', content: { 'application/json': { schema: envelope(z.array(z.unknown())) } } } },
});

registry.registerPath({
  method: 'post',
  path: '/drivers/me/documents',
  summary: 'Upload a KYC document to the caller\'s own Driver record (multipart/form-data: file + category/type/regNo)',
  security: [{ bearerAuth: [] }],
  responses: { 201: { description: 'Document stored', content: { 'application/json': { schema: envelope(z.unknown()) } } } },
});

registry.registerPath({
  method: 'delete',
  path: '/drivers/me/documents/{docId}',
  summary: "Delete one of the caller's own documents (a docId belonging to another driver 404s)",
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ docId: z.string().uuid() }) },
  responses: { 200: { description: 'Document deleted', content: { 'application/json': { schema: envelope(z.object({ id: z.string().uuid() })) } } } },
});

const MASTER_LIST_CATEGORIES = [
  'driver-types',
  'education',
  'eye-visions',
  'health-docs',
  'personal-docs',
  'police-docs',
  'source-types',
  'statuses',
  'languages',
];
for (const category of MASTER_LIST_CATEGORIES) {
  registerCrudPaths(`/masters/${category}`, `master list item (${category})`, CreateMasterListItemSchema, UpdateMasterListItemSchema);
}
registerCrudPaths('/masters/vehicle-types', 'vehicle type', CreateVehicleTypeSchema, UpdateVehicleTypeSchema);
registerCrudPaths('/masters/zones', 'service zone', CreateServiceZoneSchema, UpdateServiceZoneSchema);

// Payments/Reports remain out of scope for this build (Phase 2/3).
for (const menuKey of ['payments', 'reports']) {
  registry.registerPath({
    method: 'get',
    path: `/${menuKey}`,
    summary: `List ${menuKey} (stub — proves the permission gate, no business logic yet)`,
    security: [{ bearerAuth: [] }],
    responses: { 200: { description: 'Empty stub list', content: { 'application/json': { schema: envelope(z.array(z.unknown())) } } } },
  });
}

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: { title: 'mera-driver-api', version: '1.0.0', description: 'Driver booking RBAC + business API (independent of msd-api).' },
    servers: [{ url: '/' }],
  });
}
