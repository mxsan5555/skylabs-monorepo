import { Router } from 'express';
import type { Request } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { z } from 'zod';
import { UuidParamSchema, PaginationQuerySchema } from '../schemas/common.schema';
import {
  RoleCreateSchema,
  RoleUpdateSchema,
  RoleStatusUpdateSchema,
  RoleCloneSchema,
  RolePermissionsUpdateSchema,
  RoleWidgetsUpdateSchema,
  DashboardWidgetCreateSchema,
  UserListQuerySchema,
  UserCreateSchema,
  UserUpdateSchema,
  UserStatusUpdateSchema,
  UserRoleSetSchema,
  RoleConflictResolveSchema,
  ImpersonateRequestSchema,
} from '../schemas/rbac.schema';
import * as roleService from '../services/role.service';
import * as widgetService from '../services/dashboard-widget.service';
import * as userService from '../services/user.service';
import {
  assertCanAssignRole,
  assertCanEditRole,
  assertCanManageUser,
  assertNotLastSuperAdmin,
} from '../services/super-admin-guard.service';
import { startImpersonation } from '../services/impersonation.service';
import { getBootstrap } from '../services/bootstrap.service';
import { writeAuditLog } from '../services/audit.service';
import { prisma } from '../lib/prisma';
import { sendData, ApiError } from '../lib/http';
import { invalidatePermissionCache, isSuperAdminRoleSet, resolveGrantedPermissions } from '../services/permission-resolver.service';
import { scopeFor } from '@skylabs-monorepo/shared-permissions';

const UserRoleParamsSchema = z.object({ id: z.string().uuid(), roleId: z.string().uuid() });

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
  async (_req, _res, next) => {
    // `createRole` always throws `ROLE_MANAGEMENT_LOCKED` (PLANNING.md §1.1/R1) — no role is
    // ever actually created, so there is nothing left here to audit-log or respond with.
    try {
      await roleService.createRole(_req.body);
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
      await assertCanEditRole(req.user!.sub, req.params.id);
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
      // A deleted role can no longer contribute any grant to whatever role-key combination it
      // used to be part of — without this, anyone else sharing that combination would keep
      // resolving the now-deleted role's permissions from the cache for up to CACHE_TTL_MS.
      invalidatePermissionCache();
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
  async (req, _res, next) => {
    // `cloneRole` always throws `ROLE_MANAGEMENT_LOCKED` (PLANNING.md §1.1/R1) — no role is
    // ever actually cloned, so there is nothing left here to audit-log or respond with.
    try {
      await roleService.cloneRole(req.params.id, req.body.key, req.body.name);
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
      await assertCanEditRole(req.user!.sub, req.params.id);
      const role = await roleService.setRoleStatus(req.params.id, req.body.isActive);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'role.status_change',
        targetType: 'Role',
        targetId: role.id,
        after: { isActive: role.isActive },
        ...requestMeta(req),
      });
      // `resolveGrantedPermissionKeys` filters on `role.isActive` — a deactivated role's grants
      // must stop applying immediately, not up to CACHE_TTL_MS later.
      invalidatePermissionCache();
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
  async (req, res, next) => {
    try {
      const data =
        await roleService.getRolePermissions(
          req.params.id,
        );

      sendData(res, data);
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
      const { permissions } = req.body;
      await assertCanEditRole(req.user!.sub, req.params.id);
      const result = await roleService.setRolePermissions(req.params.id, permissions);

      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'role.permissions.set',
        targetType: 'Role',
        targetId: req.params.id,
        after: { permissions },
        ...requestMeta(req),
      });
      // Same reasoning as DELETE /roles/:id and PATCH /roles/:id/status just above — without
      // this, every already-signed-in holder of this role (or anyone who signs in within the
      // next CACHE_TTL_MS) keeps resolving the pre-save grant set from the resolver's cache,
      // even though the Role Permission Matrix UI already shows the saved result as current.
      invalidatePermissionCache();
      sendData(res, result);
    } catch (error) {
      next(error);
    }
  },
);


router.get(
  '/roles/:id/widgets',
  requirePermission('rbac.roles', 'view'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      const widgets = await roleService.getRoleWidgets(req.params.id);
      sendData(res, widgets);
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
      await assertCanEditRole(req.user!.sub, req.params.id);
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

router.get('/users', requirePermission('rbac.users', 'view'), validateQuery(UserListQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize, search, roleKey } = req.validatedQuery as ReturnType<typeof UserListQuerySchema.parse>;
    const viewerIsSuperAdmin = await isSuperAdminRoleSet(req.user!.roles);
    const { items, total } = await userService.listUsers(page, pageSize, {
      search,
      roleKey,
      viewerId: req.user!.sub,
      viewerIsSuperAdmin,
    });
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

// Registered BEFORE `/users/:id` below — Express matches by registration order, and `:id` would
// otherwise swallow the literal path segment "me" and 422 on `UuidParamSchema`.
//
// Authenticate-only (like `/notifications`), never gated on `rbac.users:*` — every signed-in
// user, Superadmin included, can view/edit their OWN row this way. `UserUpdateSchema` only ever
// has `name`/`email`/`phone` (no `role`/`roleIds` field exists on it at all), so "a caller can
// never change their own role through this route" holds for every caller by construction, not as
// a Superadmin-specific carve-out — the same schema already used by the admin-on-behalf
// `PATCH /users/:id` below.
router.get('/users/me', async (req, res, next) => {
  try {
    const user = await userService.getUserOrThrow(req.user!.sub);
    sendData(res, userService.serializeUser(user));
  } catch (err) {
    next(err);
  }
});

router.patch('/users/me', validateBody(UserUpdateSchema), async (req, res, next) => {
  try {
    const user = await userService.updateUser(req.user!.sub, req.body);
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
});

router.get(
  '/users/:id',
  requirePermission('rbac.users', 'view'),
  validateParams(UuidParamSchema),
  async (req, res, next) => {
    try {
      await userService.assertStaffUserOrThrow(req.params.id);
      const user = await userService.getUserOrThrow(req.params.id);
      const viewerIsSuperAdmin = await isSuperAdminRoleSet(req.user!.roles);
      sendData(res, userService.serializeUser(user, { includeLastLogin: viewerIsSuperAdmin || user.id === req.user!.sub }));
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
      await assertCanManageUser(req.user!.sub, req.params.id);
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
      await assertCanManageUser(req.user!.sub, req.params.id);
      await assertNotLastSuperAdmin(req.params.id);
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
      await assertCanManageUser(req.user!.sub, req.params.id);
      if (req.body.status !== 'active') await assertNotLastSuperAdmin(req.params.id);
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

// Atomic single-role replace — the ONLY staff role-change endpoint (replaces the old
// POST/DELETE /users/:id/roles/:roleId pair, which could leave a user holding more than one role
// since assign/unassign were independent calls). `setStaffUserRole` rejects Customer/Member and
// inactive roles server-side; `assertStaffUserOrThrow` keeps this from ever reaching an excluded
// account. Cache invalidation matches every other role-affecting mutation in this file.
router.put(
  '/users/:id/role',
  requirePermission('rbac.users', 'assign'),
  validateParams(UserRoleParamsSchema),
  async (req, res, next) => {
    try {
      await assertCanManageUser(req.user!.sub, req.params.id);
      await assertCanAssignRole(req.user!.sub, req.params.roleId);
      await userService.assignRole(req.params.id, req.params.roleId);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'user.role.set',
        targetType: 'User',
        targetId: req.params.id,
        before: { roleIds: before.roles.map((r) => r.role.id) },
        after: { roleId: req.body.roleId },
        ...requestMeta(req),
      });
      sendData(res, user);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Role Conflicts (legacy multi-role accounts awaiting manual review) ──────────────────────
// Gated the same as staff role assignment (`rbac.users:assign`) — resolving a flagged account IS
// a role assignment, just not restricted to "eligible staff roles" since the correct resolution
// may genuinely be Customer or Member (see `resolveAccountRoleConflict`'s own doc comment).

router.get('/role-conflicts', requirePermission('rbac.users', 'assign'), async (_req, res, next) => {
  try {
    sendData(res, await userService.listRoleConflicts());
  } catch (err) {
    next(err);
  }
});

router.put(
  '/role-conflicts/:id',
  requirePermission('rbac.users', 'assign'),
  validateParams(UserRoleParamsSchema),
  async (req, res, next) => {
    try {
      await assertCanManageUser(req.user!.sub, req.params.id);
      if (await assertCanAssignRole(req.user!.sub, req.params.roleId)) await assertNotLastSuperAdmin(req.params.id);
      await userService.unassignRole(req.params.id, req.params.roleId);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'user.role_conflict.resolve',
        targetType: 'User',
        targetId: req.params.id,
        before: { roleIds: before.roles.map((r) => r.role.id) },
        after: { roleId: req.body.roleId },
        ...requestMeta(req),
      });
      sendData(res, user);
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
      await assertCanManageUser(req.user!.sub, req.params.id);
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
      await assertCanManageUser(req.user!.sub, req.params.id);
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

// "Logs (login history)" — every authenticated role (Customer/Vendor/Superadmin included) can
// always see their OWN login history, the same "own:VE"-style universal-self-access as My
// Profile — never gated on `rbac.users:*`, so Marketing/Sales/Support/Member (who hold none of
// that) still reach this. Registered before the `:id` variant below for the same Express
// route-ordering reason as `/users/me` vs `/users/:id`.
router.get('/users/me/login-history', validateQuery(PaginationQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize } = req.validatedQuery as ReturnType<typeof PaginationQuerySchema.parse>;
    const { items, total } = await userService.getLoginHistory(req.user!.sub, page, pageSize);
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/users/:id/login-history',
  requirePermission('rbac.users', 'view'),
  validateParams(UuidParamSchema),
  validateQuery(PaginationQuerySchema),
  async (req, res, next) => {
    try {
      await userService.assertStaffUserOrThrow(req.params.id);
      // Admin's Staff Users:view is deliberately "own login history only" (see the Logs row of
      // the permission matrix) — only an actual Superadmin may read a DIFFERENT user's login
      // history through this admin-on-behalf route; everyone else gets the same genuine
      // not-found a non-existent id would, never a tell-tale 403 (don't leak "this id exists but
      // you can't see it").
      if (req.params.id !== req.user!.sub && !(await isSuperAdminRoleSet(req.user!.roles))) {
        throw new ApiError('NOT_FOUND', 'User not found');
      }
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
      await userService.assertStaffUserOrThrow(req.params.id);
      sendData(res, await userService.getSessions(req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

// ─── Audit logs ──────────────────────────────────────────────────────────────

/**
 * PLANNING.md §1.2's Logs row: `V A` for Super Admin, `V O` (own actions only) for everyone
 * else. `rbac.audit-logs:view`'s scope is resolved per-caller (see `SCOPE_ENFORCED_PERMISSION_
 * KEYS` in role.service.ts — this is the one key it's real for today) rather than hardcoded to
 * a role-name check.
 */
router.get('/audit-logs', requirePermission('rbac.audit-logs', 'view'), validateQuery(PaginationQuerySchema), async (req, res, next) => {
  try {
    const targetUserId = typeof req.query.targetUserId === 'string' ? req.query.targetUserId : undefined;
    const { page, pageSize } = req.validatedQuery as ReturnType<typeof PaginationQuerySchema.parse>;
    const { scopes } = await resolveGrantedPermissions(req.user!.roles);
    const ownScopeOnly = scopeFor(scopes, 'rbac.audit-logs', 'view') === 'OWN';
    const where = {
      ...(targetUserId ? { targetType: 'User', targetId: targetUserId } : {}),
      ...(ownScopeOnly ? { actorUserId: req.user!.sub } : {}),
    };
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
