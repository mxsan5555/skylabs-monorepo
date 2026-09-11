import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  OtpRequestSchema,
  OtpVerifySchema,
  RefreshRequestSchema,
  LogoutRequestSchema,
  TokenPairResponseSchema,
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
} from './schemas/rbac.schema';

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
// Business module stubs
// ---------------------------------------------------------------------------

for (const menuKey of ['drivers', 'vehicles', 'trips', 'attendance', 'payments', 'reports']) {
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
