import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  OtpRequestSchema,
  OtpVerifySchema,
  RefreshRequestSchema,
  AuthTokensResponseSchema,
} from '../schemas/auth.schema';
import {
  RoleCreateSchema,
  RoleUpdateSchema,
  RoleStatusUpdateSchema,
  RoleCloneSchema,
  RolePermissionsUpdateSchema,
  RolePermissionsResponseSchema,
  RoleWidgetsUpdateSchema,
  DashboardWidgetCreateSchema,
  UserCreateSchema,
  UserUpdateSchema,
  UserStatusUpdateSchema,
  ImpersonateRequestSchema,
} from '../schemas/rbac.schema';
import { ErrorObjectSchema } from '../schemas/common.schema';

export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });

  const bearer = [{ bearerAuth: [] }];
  const errorResponse = { description: 'Error', content: { 'application/json': { schema: ErrorObjectSchema } } };

  // ─── Auth ──────────────────────────────────────────────────────────────────

  registry.registerPath({
    method: 'post',
    path: '/auth/otp/request',
    summary: 'Request an OTP for phone/email login',
    tags: ['Auth'],
    request: { body: { content: { 'application/json': { schema: OtpRequestSchema } } } },
    responses: {
      200: { description: 'OTP sent (or silently no-op for an unknown identifier)' },
      429: errorResponse,
      422: errorResponse,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/otp/verify',
    summary: 'Verify an OTP and receive a JWT pair',
    tags: ['Auth'],
    request: { body: { content: { 'application/json': { schema: OtpVerifySchema } } } },
    responses: {
      200: {
        description: 'Authenticated',
        content: { 'application/json': { schema: AuthTokensResponseSchema } },
      },
      401: errorResponse,
      429: errorResponse,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/auth/google',
    summary: 'Redirect to Google OAuth consent screen',
    tags: ['Auth'],
    responses: { 302: { description: 'Redirect to Google' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/auth/google/callback',
    summary: 'Google OAuth callback — issues a JWT pair',
    tags: ['Auth'],
    responses: {
      200: { description: 'Authenticated', content: { 'application/json': { schema: AuthTokensResponseSchema } } },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/refresh',
    summary: 'Rotate the refresh token and issue a new access token',
    tags: ['Auth'],
    request: { body: { content: { 'application/json': { schema: RefreshRequestSchema } } } },
    responses: { 200: { description: 'Rotated' }, 401: errorResponse },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/logout',
    summary: 'Revoke the current refresh session',
    tags: ['Auth'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: RefreshRequestSchema } } } },
    responses: { 200: { description: 'Logged out' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/logout-all',
    summary: 'Revoke every refresh session for the caller',
    tags: ['Auth'],
    security: bearer,
    responses: { 200: { description: 'All sessions revoked' } },
  });

  // ─── RBAC: bootstrap ─────────────────────────────────────────────────────────

  registry.registerPath({
    method: 'get',
    path: '/rbac/bootstrap',
    summary: 'Roles, permissions, menu, and dashboard widgets for the caller',
    tags: ['RBAC'],
    security: bearer,
    responses: { 200: { description: 'Bootstrap payload' } },
  });

  // ─── RBAC: roles ─────────────────────────────────────────────────────────────

  registry.registerPath({
    method: 'get',
    path: '/rbac/roles',
    summary: 'List roles',
    tags: ['RBAC - Roles'],
    security: bearer,
    responses: { 200: { description: 'Roles' }, 403: errorResponse },
  });

  registry.registerPath({
    method: 'post',
    path: '/rbac/roles',
    summary: 'Create a role',
    tags: ['RBAC - Roles'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: RoleCreateSchema } } } },
    responses: { 201: { description: 'Created' }, 403: errorResponse, 409: errorResponse },
  });

  registry.registerPath({
    method: 'patch',
    path: '/rbac/roles/{id}',
    summary: 'Update a role',
    tags: ['RBAC - Roles'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: RoleUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' }, 403: errorResponse, 404: errorResponse },
  });

  registry.registerPath({
    method: 'delete',
    path: '/rbac/roles/{id}',
    summary: 'Delete a role (only if unassigned and non-system)',
    tags: ['RBAC - Roles'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Deleted' }, 403: errorResponse, 409: errorResponse },
  });

  registry.registerPath({
    method: 'post',
    path: '/rbac/roles/{id}/clone',
    summary: 'Clone a role with its permissions and widgets',
    tags: ['RBAC - Roles'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: RoleCloneSchema } } },
    },
    responses: { 201: { description: 'Cloned' } },
  });

  registry.registerPath({
    method: 'patch',
    path: '/rbac/roles/{id}/status',
    summary: 'Activate/deactivate a role',
    tags: ['RBAC - Roles'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: RoleStatusUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/rbac/permissions/catalog',
    summary: 'Full menu x action permission matrix',
    tags: ['RBAC - Roles'],
    security: bearer,
    responses: { 200: { description: 'Catalog' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/rbac/roles/{id}/permissions',
    summary: "The role's currently granted permission ids (for pre-checking a permission editor)",
    tags: ['RBAC - Roles'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: {
        description: 'Granted permission ids',
        content: { 'application/json': { schema: RolePermissionsResponseSchema } },
      },
      403: errorResponse,
      404: errorResponse,
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/rbac/roles/{id}/permissions',
    summary: 'Replace the permission set for a role',
    tags: ['RBAC - Roles'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: RolePermissionsUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' } },
  });

  registry.registerPath({
    method: 'put',
    path: '/rbac/roles/{id}/widgets',
    summary: 'Replace the dashboard widget set for a role',
    tags: ['RBAC - Roles'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: RoleWidgetsUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/rbac/dashboard-widgets',
    summary: 'List the dashboard widget catalog',
    tags: ['RBAC - Dashboard Widgets'],
    security: bearer,
    responses: { 200: { description: 'Widgets' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/rbac/dashboard-widgets',
    summary: 'Create a dashboard widget catalog entry',
    tags: ['RBAC - Dashboard Widgets'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: DashboardWidgetCreateSchema } } } },
    responses: { 201: { description: 'Created' } },
  });

  // ─── RBAC: users ─────────────────────────────────────────────────────────────

  registry.registerPath({
    method: 'get',
    path: '/rbac/users',
    summary: 'List users (paginated)',
    tags: ['RBAC - Users'],
    security: bearer,
    responses: { 200: { description: 'Users' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/rbac/users',
    summary: 'Create a user',
    tags: ['RBAC - Users'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: UserCreateSchema } } } },
    responses: { 201: { description: 'Created' } },
  });

  registry.registerPath({
    method: 'patch',
    path: '/rbac/users/{id}',
    summary: 'Update a user',
    tags: ['RBAC - Users'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: UserUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' } },
  });

  registry.registerPath({
    method: 'delete',
    path: '/rbac/users/{id}',
    summary: 'Soft-delete a user',
    tags: ['RBAC - Users'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Deleted' } },
  });

  registry.registerPath({
    method: 'patch',
    path: '/rbac/users/{id}/status',
    summary: 'Change a user status',
    tags: ['RBAC - Users'],
    security: bearer,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: UserStatusUpdateSchema } } },
    },
    responses: { 200: { description: 'Updated' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/rbac/users/{id}/roles/{roleId}',
    summary: 'Assign a role to a user',
    tags: ['RBAC - Users'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid(), roleId: z.string().uuid() }) },
    responses: { 200: { description: 'Assigned' } },
  });

  registry.registerPath({
    method: 'delete',
    path: '/rbac/users/{id}/roles/{roleId}',
    summary: 'Unassign a role from a user',
    tags: ['RBAC - Users'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid(), roleId: z.string().uuid() }) },
    responses: { 200: { description: 'Unassigned' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/rbac/users/{id}/sessions/revoke-all',
    summary: 'Revoke every refresh session for a user',
    tags: ['RBAC - Users'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Revoked' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/rbac/users/{id}/otp/reset',
    summary: 'Invalidate pending OTP challenges for a user',
    tags: ['RBAC - Users'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Reset' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/rbac/users/{id}/login-history',
    summary: 'Paginated login history for a user',
    tags: ['RBAC - Users'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Login history' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/rbac/users/{id}/sessions',
    summary: 'Active/expired device sessions for a user',
    tags: ['RBAC - Users'],
    security: bearer,
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 200: { description: 'Sessions' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/rbac/audit-logs',
    summary: 'Audit log, optionally filtered by targetUserId',
    tags: ['RBAC - Audit'],
    security: bearer,
    request: { query: z.object({ targetUserId: z.string().uuid().optional() }) },
    responses: { 200: { description: 'Audit log entries' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/rbac/impersonate',
    summary: 'Issue a short-lived "Login As" preview token for another user',
    tags: ['RBAC - Users'],
    security: bearer,
    request: { body: { content: { 'application/json': { schema: ImpersonateRequestSchema } } } },
    responses: { 200: { description: 'Preview token issued' }, 403: errorResponse },
  });

  // ─── Business module stubs ───────────────────────────────────────────────────

  for (const tag of ['customers', 'vendors', 'orders', 'products', 'inventory', 'reports']) {
    registry.registerPath({
      method: 'get',
      path: `/${tag}`,
      summary: `List ${tag} (stub — gated by requirePermission('${tag}', 'view'))`,
      tags: ['Business modules (stub)'],
      security: bearer,
      responses: { 200: { description: 'Empty list' }, 403: errorResponse },
    });
  }

  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: { title: 'MSD API', version: '1.0.0', description: 'Massage deals — RBAC, auth, and business module stubs.' },
    servers: [{ url: '/api/v1' }],
  });
}
