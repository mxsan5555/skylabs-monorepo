import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const CreateRoleSchema = z
  .object({
    key: z
      .string()
      .min(2)
      .regex(/^[a-z][a-z0-9_]*$/, 'key must be snake_case'),
    name: z.string().min(1),
    description: z.string().optional(),
  })
  .openapi('CreateRole');

export const UpdateRoleSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
  })
  .openapi('UpdateRole');

export const CloneRoleSchema = z
  .object({
    key: z
      .string()
      .min(2)
      .regex(/^[a-z][a-z0-9_]*$/, 'key must be snake_case'),
    name: z.string().min(1),
  })
  .openapi('CloneRole');

export const SetRoleStatusSchema = z
  .object({
    isActive: z.boolean(),
  })
  .openapi('SetRoleStatus');

export const SetRolePermissionsSchema = z
  .object({
    permissionIds: z.array(z.string().uuid()),
  })
  .openapi('SetRolePermissions');

export const SetRoleWidgetsSchema = z
  .object({
    widgets: z.array(
      z.object({
        widgetId: z.string().uuid(),
        order: z.number().int().min(0),
      }),
    ),
  })
  .openapi('SetRoleWidgets');

export const CreateDashboardWidgetSchema = z
  .object({
    key: z.string().min(1),
    title: z.string().min(1),
    module: z.string().min(1),
    description: z.string().optional(),
  })
  .openapi('CreateDashboardWidget');

export const CreateUserSchema = z
  .object({
    name: z.string().min(1),
    email: z.string().email().optional(),
    phone: z.string().min(3).optional(),
    roleIds: z.array(z.string().uuid()).optional(),
  })
  .openapi('CreateUser');

export const UpdateUserSchema = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(3).optional(),
  })
  .openapi('UpdateUser');

export const SetUserStatusSchema = z
  .object({
    status: z.enum(['active', 'inactive', 'blocked']),
  })
  .openapi('SetUserStatus');

export const ImpersonateSchema = z
  .object({
    targetUserId: z.string().uuid(),
  })
  .openapi('Impersonate');
