import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PERMISSION_ACTIONS, type PermissionAction } from '@skylabs-monorepo/shared-types';

extendZodWithOpenApi(z);

export const PermissionActionSchema = z
  .enum(PERMISSION_ACTIONS as [PermissionAction, ...PermissionAction[]])
  .openapi('PermissionAction');

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

export const RoleCloneSchema = z
  .object({
    key: z
      .string()
      .min(2)
      .max(50)
      .regex(/^[a-z][a-z0-9_]*$/, 'key must be a lower_snake_case slug'),
    name: z.string().min(1).max(100),
  })
  .openapi('RoleClone');

export const RolePermissionsUpdateSchema = z
  .object({
    permissionIds: z.array(z.string().uuid()),
  })
  .openapi('RolePermissionsUpdate');

export const RolePermissionsResponseSchema = z
  .object({
    permissionIds: z.array(z.string().uuid()),
  })
  .openapi('RolePermissionsResponse');

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

export const UserCreateSchema = z
  .object({
    name: z.string().min(1).max(150),
    email: z.string().email().optional(),
    phone: z.string().min(3).max(30).optional(),
    roleIds: z.array(z.string().uuid()).default([]),
  })
  .openapi('UserCreate');

export const UserUpdateSchema = z
  .object({
    name: z.string().min(1).max(150).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(3).max(30).optional(),
  })
  .openapi('UserUpdate');

export const UserStatusUpdateSchema = z
  .object({
    status: z.enum(['active', 'inactive', 'blocked']),
  })
  .openapi('UserStatusUpdate');

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
