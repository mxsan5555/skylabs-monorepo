import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody } from '../middleware/validate';
import { HttpError } from '../middleware/errorHandler';
import * as roleService from '../services/role.service';
import * as userService from '../services/user.service';
import * as auditService from '../services/audit.service';
import { impersonateUser } from '../services/impersonation.service';
import { buildBootstrapResponse } from '../services/bootstrap.service';
import { resetOtpForUser } from '../services/user.service';
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
} from '../schemas/rbac.schema';

const router = Router();

router.use(authenticate);

function requestMeta(req: import('express').Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

router.get('/roles', requirePermission('rbac.roles', 'view'), async (_req, res, next) => {
  try {
    const roles = await roleService.listRoles();
    res.json({ data: roles, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/roles', requirePermission('rbac.roles', 'create'), validateBody(CreateRoleSchema), async (req, res, next) => {
  try {
    const role = await roleService.createRole(req.body);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'role.create',
      targetType: 'Role',
      targetId: role.id,
      after: role,
      ...requestMeta(req),
    });
    res.status(201).json({ data: role, error: null });
  } catch (err) {
    next(err);
  }
});

router.patch('/roles/:id', requirePermission('rbac.roles', 'edit'), validateBody(UpdateRoleSchema), async (req, res, next) => {
  try {
    const before = await roleService.getRoleById(req.params.id);
    const role = await roleService.updateRole(req.params.id, req.body);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'role.update',
      targetType: 'Role',
      targetId: role.id,
      before,
      after: role,
      ...requestMeta(req),
    });
    res.json({ data: role, error: null });
  } catch (err) {
    next(err);
  }
});

router.delete('/roles/:id', requirePermission('rbac.roles', 'delete'), async (req, res, next) => {
  try {
    const before = await roleService.getRoleById(req.params.id);
    await roleService.deleteRole(req.params.id);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'role.delete',
      targetType: 'Role',
      targetId: req.params.id,
      before,
      ...requestMeta(req),
    });
    res.json({ data: { id: req.params.id }, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/roles/:id/clone', requirePermission('rbac.roles', 'create'), validateBody(CloneRoleSchema), async (req, res, next) => {
  try {
    const clone = await roleService.cloneRole(req.params.id, req.body.key, req.body.name);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'role.clone',
      targetType: 'Role',
      targetId: clone.id,
      after: clone,
      ...requestMeta(req),
    });
    res.status(201).json({ data: clone, error: null });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/roles/:id/status',
  requirePermission('rbac.roles', 'status_change'),
  validateBody(SetRoleStatusSchema),
  async (req, res, next) => {
    try {
      const role = await roleService.setRoleStatus(req.params.id, req.body.isActive);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'role.status_change',
        targetType: 'Role',
        targetId: role.id,
        after: role,
        ...requestMeta(req),
      });
      res.json({ data: role, error: null });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/permissions/catalog', requirePermission('rbac.roles', 'view'), async (_req, res, next) => {
  try {
    const catalog = await roleService.buildPermissionCatalog();
    res.json({ data: catalog, error: null });
  } catch (err) {
    next(err);
  }
});

// GET a role's current grants (flat permissionIds) — lets the UI pre-check the right boxes
// in the catalog before editing and re-saving via PUT /rbac/roles/:id/permissions below.
router.get('/roles/:id/permissions', requirePermission('rbac.roles', 'view'), async (req, res, next) => {
  try {
    const permissionIds = await roleService.getRolePermissionIds(req.params.id);
    res.json({ data: { permissionIds }, error: null });
  } catch (err) {
    next(err);
  }
});

router.put(
  '/roles/:id/permissions',
  requirePermission('rbac.roles', 'edit'),
  validateBody(SetRolePermissionsSchema),
  async (req, res, next) => {
    try {
      const links = await roleService.setRolePermissions(req.params.id, req.body.permissionIds);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'role.permissions.set',
        targetType: 'Role',
        targetId: req.params.id,
        after: { permissionIds: req.body.permissionIds },
        ...requestMeta(req),
      });
      res.json({ data: links, error: null });
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/roles/:id/widgets',
  requirePermission('rbac.roles', 'edit'),
  validateBody(SetRoleWidgetsSchema),
  async (req, res, next) => {
    try {
      const links = await roleService.setRoleWidgets(req.params.id, req.body.widgets);
      res.json({ data: links, error: null });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Dashboard widgets (catalog)
// ---------------------------------------------------------------------------

router.get('/dashboard-widgets', requirePermission('rbac.roles', 'view'), async (_req, res, next) => {
  try {
    const widgets = await roleService.listDashboardWidgets();
    res.json({ data: widgets, error: null });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/dashboard-widgets',
  requirePermission('rbac.roles', 'create'),
  validateBody(CreateDashboardWidgetSchema),
  async (req, res, next) => {
    try {
      const widget = await roleService.createDashboardWidget(req.body);
      res.status(201).json({ data: widget, error: null });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

router.get('/users', requirePermission('rbac.users', 'view'), async (req, res, next) => {
  try {
    const page = req.query.page ? Number(req.query.page) : undefined;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;
    const { rows, total } = await userService.listUsers({ page, pageSize });
    res.json({ data: rows, error: null, meta: { total, page: page ?? 1, pageSize: pageSize ?? 25 } });
  } catch (err) {
    next(err);
  }
});

router.post('/users', requirePermission('rbac.users', 'create'), validateBody(CreateUserSchema), async (req, res, next) => {
  try {
    const user = await userService.createUser(req.body);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'user.create',
      targetType: 'User',
      targetId: user.id,
      after: user,
      ...requestMeta(req),
    });
    res.status(201).json({ data: user, error: null });
  } catch (err) {
    next(err);
  }
});

router.patch('/users/:id', requirePermission('rbac.users', 'edit'), validateBody(UpdateUserSchema), async (req, res, next) => {
  try {
    const user = await userService.updateUser(req.params.id, req.body);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'user.update',
      targetType: 'User',
      targetId: user.id,
      after: user,
      ...requestMeta(req),
    });
    res.json({ data: user, error: null });
  } catch (err) {
    next(err);
  }
});

router.delete('/users/:id', requirePermission('rbac.users', 'delete'), async (req, res, next) => {
  try {
    await userService.softDeleteUser(req.params.id);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'user.delete',
      targetType: 'User',
      targetId: req.params.id,
      ...requestMeta(req),
    });
    res.json({ data: { id: req.params.id }, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/roles/:roleId', requirePermission('rbac.users', 'assign'), async (req, res, next) => {
  try {
    const user = await userService.assignRoleToUser(req.params.id, req.params.roleId);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'user.role.assign',
      targetType: 'User',
      targetId: req.params.id,
      after: { roleId: req.params.roleId },
      ...requestMeta(req),
    });
    res.json({ data: user, error: null });
  } catch (err) {
    next(err);
  }
});

router.delete('/users/:id/roles/:roleId', requirePermission('rbac.users', 'assign'), async (req, res, next) => {
  try {
    const user = await userService.removeRoleFromUser(req.params.id, req.params.roleId);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'user.role.remove',
      targetType: 'User',
      targetId: req.params.id,
      before: { roleId: req.params.roleId },
      ...requestMeta(req),
    });
    res.json({ data: user, error: null });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/users/:id/status',
  requirePermission('rbac.users', 'status_change'),
  validateBody(SetUserStatusSchema),
  async (req, res, next) => {
    try {
      const user = await userService.setUserStatus(req.params.id, req.body.status);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'user.status_change',
        targetType: 'User',
        targetId: user.id,
        after: { status: req.body.status },
        ...requestMeta(req),
      });
      res.json({ data: user, error: null });
    } catch (err) {
      next(err);
    }
  },
);

router.post('/users/:id/sessions/revoke-all', requirePermission('rbac.users', 'edit'), async (req, res, next) => {
  try {
    await userService.revokeAllSessionsForUserId(req.params.id);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'user.sessions.revoke_all',
      targetType: 'User',
      targetId: req.params.id,
      ...requestMeta(req),
    });
    res.json({ data: { message: 'All sessions revoked' }, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/otp/reset', requirePermission('rbac.users', 'edit'), async (req, res, next) => {
  try {
    await resetOtpForUser(req.params.id);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'user.otp.reset',
      targetType: 'User',
      targetId: req.params.id,
      ...requestMeta(req),
    });
    res.json({ data: { message: 'Pending OTPs invalidated' }, error: null });
  } catch (err) {
    next(err);
  }
});

router.get('/users/:id/login-history', requirePermission('rbac.users', 'view'), async (req, res, next) => {
  try {
    const rows = await userService.listLoginHistoryForUser(req.params.id);
    res.json({ data: rows, error: null });
  } catch (err) {
    next(err);
  }
});

router.get('/users/:id/sessions', requirePermission('rbac.users', 'view'), async (req, res, next) => {
  try {
    const rows = await userService.listSessionsForUser(req.params.id);
    res.json({ data: rows, error: null });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------

router.get('/audit-logs', requirePermission('rbac.audit-logs', 'view'), async (req, res, next) => {
  try {
    const page = req.query.page ? Number(req.query.page) : undefined;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;
    const targetUserId = typeof req.query.targetUserId === 'string' ? req.query.targetUserId : undefined;
    const { rows, total } = await auditService.listAuditLogs({ targetUserId, page, pageSize });
    res.json({ data: rows, error: null, meta: { total, page: page ?? 1, pageSize: pageSize ?? 25 } });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Impersonation ("Login As")
// ---------------------------------------------------------------------------

// Gated by the generic permission middleware like every other route; the additional
// SuperAdmin-flag check lives in the service layer (see impersonation.service.ts) because
// it is a narrower, action-specific safety check on top of the normal permission grant —
// not a substitute for it.
router.post('/impersonate', requirePermission('rbac.users', 'assign'), validateBody(ImpersonateSchema), async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'UNAUTHORIZED', 'Missing bearer token');
    const result = await impersonateUser({
      callerId: req.user.sub,
      targetUserId: req.body.targetUserId,
      ...requestMeta(req),
    });
    res.json({ data: result, error: null });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Bootstrap — authenticated, any role.
// ---------------------------------------------------------------------------

router.get('/bootstrap', async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, 'UNAUTHORIZED', 'Missing bearer token');
    const bootstrap = await buildBootstrapResponse(req.user);
    res.json({ data: bootstrap, error: null });
  } catch (err) {
    next(err);
  }
});

export default router;
