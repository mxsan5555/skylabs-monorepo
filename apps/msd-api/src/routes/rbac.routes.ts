import { Router } from 'express';
import type { Request } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { UuidParamSchema, PaginationQuerySchema } from '../schemas/common.schema';
import {
  RoleCreateSchema,
  RoleUpdateSchema,
  RoleStatusUpdateSchema,
  RoleCloneSchema,
  RolePermissionsUpdateSchema,
  RoleWidgetsUpdateSchema,
  DashboardWidgetCreateSchema,
  UserCreateSchema,
  UserUpdateSchema,
  UserStatusUpdateSchema,
  ImpersonateRequestSchema,
} from '../schemas/rbac.schema';
import * as roleService from '../services/role.service';
import * as widgetService from '../services/dashboard-widget.service';
import * as userService from '../services/user.service';
import { startImpersonation } from '../services/impersonation.service';
import { getBootstrap } from '../services/bootstrap.service';
import { writeAuditLog } from '../services/audit.service';
import { prisma } from '../lib/prisma';
import { sendData } from '../lib/http';

const router = Router();
router.use(authenticate);

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

// ─── Bootstrap — any authenticated user ─────────────────────────────────────

router.get('/bootstrap', async (req, res, next) => {
  try {
    const bootstrap = await getBootstrap(req.user!);
    sendData(res, bootstrap);
  } catch (err) {
    next(err);
  }
});

// ─── Roles ───────────────────────────────────────────────────────────────────

router.get('/roles', requirePermission('rbac.roles', 'view'), async (_req, res, next) => {
  try {
    sendData(res, await roleService.listRoles());
  } catch (err) {
    next(err);
  }
});

router.post(
  '/roles',
  requirePermission('rbac.roles', 'create'),
  validateBody(RoleCreateSchema),
  async (req, res, next) => {
    try {
      const role = await roleService.createRole(req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'role.create',
        targetType: 'Role',
        targetId: role.id,
        after: role,
        ...requestMeta(req),
      });
      sendData(res, role, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/roles/:id',
  requirePermission('rbac.roles', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(RoleUpdateSchema),
  async (req, res, next) => {
    try {
      const before = await roleService.getRole(req.params.id);
      const role = await roleService.updateRole(req.params.id, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'role.update',
        targetType: 'Role',
        targetId: role.id,
        before,
        after: role,
        ...requestMeta(req),
      });
      sendData(res, role);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/roles/:id',
  requirePermission('rbac.roles', 'delete'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      const before = await roleService.getRole(req.params.id);
      await roleService.deleteRole(req.params.id);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'role.delete',
        targetType: 'Role',
        targetId: req.params.id,
        before,
        ...requestMeta(req),
      });
      sendData(res, null);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/roles/:id/clone',
  requirePermission('rbac.roles', 'create'),
  validateParams(UuidParamSchema),
  validateBody(RoleCloneSchema),
  async (req, res, next) => {
    try {
      const clone = await roleService.cloneRole(req.params.id, req.body.key, req.body.name);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'role.clone',
        targetType: 'Role',
        targetId: clone.id,
        before: { sourceRoleId: req.params.id },
        after: clone,
        ...requestMeta(req),
      });
      sendData(res, clone, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/roles/:id/status',
  requirePermission('rbac.roles', 'status_change'),
  validateParams(UuidParamSchema),
  validateBody(RoleStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const role = await roleService.setRoleStatus(req.params.id, req.body.isActive);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'role.status_change',
        targetType: 'Role',
        targetId: role.id,
        after: { isActive: role.isActive },
        ...requestMeta(req),
      });
      sendData(res, role);
    } catch (err) {
      next(err);
    }
  },
);

router.get('/permissions/catalog', requirePermission('rbac.roles', 'view'), async (_req, res, next) => {
  try {
    sendData(res, await roleService.getPermissionCatalog());
  } catch (err) {
    next(err);
  }
});

router.get(
  '/roles/:id/permissions',
  requirePermission('rbac.roles', 'view'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      const permissionIds = await roleService.getRolePermissionIds(req.params.id);
      sendData(res, { permissionIds });
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/roles/:id/permissions',
  requirePermission('rbac.roles', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(RolePermissionsUpdateSchema),
  async (req, res, next) => {
    try {
      const result = await roleService.setRolePermissions(req.params.id, req.body.permissionIds);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'role.permissions.set',
        targetType: 'Role',
        targetId: req.params.id,
        after: { permissionIds: req.body.permissionIds },
        ...requestMeta(req),
      });
      sendData(res, result);
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/roles/:id/widgets',
  requirePermission('rbac.roles', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(RoleWidgetsUpdateSchema),
  async (req, res, next) => {
    try {
      const result = await roleService.setRoleWidgets(req.params.id, req.body.widgets);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'role.widgets.set',
        targetType: 'Role',
        targetId: req.params.id,
        after: { widgets: req.body.widgets },
        ...requestMeta(req),
      });
      sendData(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Dashboard widgets (catalog) ─────────────────────────────────────────────

router.get('/dashboard-widgets', requirePermission('rbac.roles', 'view'), async (_req, res, next) => {
  try {
    sendData(res, await widgetService.listDashboardWidgets());
  } catch (err) {
    next(err);
  }
});

router.post(
  '/dashboard-widgets',
  requirePermission('rbac.roles', 'create'),
  validateBody(DashboardWidgetCreateSchema),
  async (req, res, next) => {
    try {
      const widget = await widgetService.createDashboardWidget(req.body);
      sendData(res, widget, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Users ───────────────────────────────────────────────────────────────────

router.get('/users', requirePermission('rbac.users', 'view'), validateQuery(PaginationQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize } = req.validatedQuery as ReturnType<typeof PaginationQuerySchema.parse>;
    const { items, total } = await userService.listUsers(page, pageSize);
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/users',
  requirePermission('rbac.users', 'create'),
  validateBody(UserCreateSchema),
  async (req, res, next) => {
    try {
      const user = await userService.createUser(req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'user.create',
        targetType: 'User',
        targetId: user.id,
        after: user,
        ...requestMeta(req),
      });
      sendData(res, user, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/users/:id',
  requirePermission('rbac.users', 'edit'),
  validateParams(UuidParamSchema),
  validateBody(UserUpdateSchema),
  async (req, res, next) => {
    try {
      const user = await userService.updateUser(req.params.id, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'user.update',
        targetType: 'User',
        targetId: user.id,
        after: user,
        ...requestMeta(req),
      });
      sendData(res, user);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/users/:id',
  requirePermission('rbac.users', 'delete'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      await userService.softDeleteUser(req.params.id);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'user.delete',
        targetType: 'User',
        targetId: req.params.id,
        ...requestMeta(req),
      });
      sendData(res, null);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/users/:id/status',
  requirePermission('rbac.users', 'status_change'),
  validateParams(UuidParamSchema),
  validateBody(UserStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const user = await userService.setUserStatus(req.params.id, req.body.status);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'user.status_change',
        targetType: 'User',
        targetId: user.id,
        after: { status: user.status },
        ...requestMeta(req),
      });
      sendData(res, user);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/users/:id/roles/:roleId',
  requirePermission('rbac.users', 'assign'),
  async (req, res, next) => {
    try {
      await userService.assignRole(req.params.id, req.params.roleId);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'user.role.assign',
        targetType: 'User',
        targetId: req.params.id,
        after: { roleId: req.params.roleId },
        ...requestMeta(req),
      });
      sendData(res, { assigned: true });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/users/:id/roles/:roleId',
  requirePermission('rbac.users', 'assign'),
  async (req, res, next) => {
    try {
      await userService.unassignRole(req.params.id, req.params.roleId);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'user.role.unassign',
        targetType: 'User',
        targetId: req.params.id,
        before: { roleId: req.params.roleId },
        ...requestMeta(req),
      });
      sendData(res, { assigned: false });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/users/:id/sessions/revoke-all',
  requirePermission('rbac.users', 'edit'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      await userService.revokeAllSessionsForUser(req.params.id);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'user.sessions.revoke_all',
        targetType: 'User',
        targetId: req.params.id,
        ...requestMeta(req),
      });
      sendData(res, { revoked: true });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/users/:id/otp/reset',
  requirePermission('rbac.users', 'edit'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      await userService.resetOtpForUser(req.params.id);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'user.otp.reset',
        targetType: 'User',
        targetId: req.params.id,
        ...requestMeta(req),
      });
      sendData(res, { reset: true });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/users/:id/login-history',
  requirePermission('rbac.users', 'view'),
  validateParams(UuidParamSchema),
  validateQuery(PaginationQuerySchema),
  async (req, res, next) => {
    try {
      const { page, pageSize } = req.validatedQuery as ReturnType<typeof PaginationQuerySchema.parse>;
      const { items, total } = await userService.getLoginHistory(req.params.id, page, pageSize);
      sendData(res, items, { meta: { total, page, pageSize } });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/users/:id/sessions',
  requirePermission('rbac.users', 'view'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      sendData(res, await userService.getSessions(req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

// ─── Audit logs ──────────────────────────────────────────────────────────────

router.get('/audit-logs', requirePermission('rbac.audit-logs', 'view'), validateQuery(PaginationQuerySchema), async (req, res, next) => {
  try {
    const targetUserId = typeof req.query.targetUserId === 'string' ? req.query.targetUserId : undefined;
    const { page, pageSize } = req.validatedQuery as ReturnType<typeof PaginationQuerySchema.parse>;
    const where = targetUserId ? { targetType: 'User', targetId: targetUserId } : {};
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

// ─── Impersonation ───────────────────────────────────────────────────────────

// Gated dynamically via the `rbac.users:custom` permission (auto-granted to super_admin
// at seed time) rather than a hardcoded `role.isSuperAdmin` check in route code — keeps
// the "no hardcoded role checks" rule intact while still restricting this to the intended
// role in practice, and lets it be re-granted to another role later purely via data.
router.post(
  '/impersonate',
  requirePermission('rbac.users', 'custom'),
  validateBody(ImpersonateRequestSchema),
  async (req, res, next) => {
    try {
      const result = await startImpersonation(req.user!.sub, req.body.targetUserId, requestMeta(req));
      sendData(res, result);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
