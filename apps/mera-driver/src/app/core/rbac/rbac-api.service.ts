import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';
import { Observable, map } from 'rxjs';
import type {
  ApiEnvelope,
  AuditLogEntry,
  DashboardWidget,
  DeviceSession,
  LoginHistoryEntry,
  PermissionAction,
  Role,
  User,
  UserStatus,
} from '@skylabs-monorepo/shared-types';
import { environment } from '../../../environments/environment';

/**
 * One grantable action within a permission-catalog node — mirrors
 * `apps/mera-driver-api/src/services/role.service.ts#PermissionCatalogAction`.
 * `permissionId` is the real DB `Permission.id` a checkbox round-trips through
 * `PUT /rbac/roles/:id/permissions`, or `null` if no Permission row exists yet
 * for that (menuKey, action) pair (e.g. an action the seed script never granted
 * to anyone) — those can't be selected since there's nothing to submit.
 */
export interface PermissionCatalogAction {
  action: PermissionAction;
  key: string;
  permissionId: string | null;
  label: string;
}

/**
 * One row per menu node returned by `GET /rbac/permissions/catalog`, listing
 * every grantable action on it — see `role.service.ts#buildPermissionCatalog`
 * and `#PermissionCatalogNode`.
 */
export interface PermissionCatalogNode {
  menuKey: string;
  title: string;
  groupTitle?: string;
  actions: PermissionCatalogAction[];
}

export interface RoleWidgetLink {
  roleId: string;
  widgetId: string;
  order: number;
  widget: DashboardWidget;
}

export interface CreateRoleInput {
  key: string;
  name: string;
  description?: string;
  isActive?: boolean;
  permissionIds?: string[];
}

export interface UpdateRoleInput {
  name?: string;
  description?: string;
  isActive?: boolean;
  permissionIds?: string[];
}

export interface CreateUserInput {
  status?:UserStatus;
  name: string;
  email?: string;
  phone?: string;
  roleIds?: string[];
}

export interface UpdateUserInput {
  status?:UserStatus;
  roleIds?:string[];
  name?: string;
  email?: string;
  phone?: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Typed client for mera-driver-api's `/rbac/*` surface (roles, permission catalog,
 * dashboard widgets, users, audit logs). Every endpoint is gated server-side by
 * `requirePermission` — a 403 here means the caller's role genuinely lacks the grant,
 * not a bug in this client.
 */
@Injectable({ providedIn: 'root' })
export class RbacApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private authorizationRefresh: Promise<void> | null = null;

  /** Reuse backend bootstrap and the existing session lifecycle; credentials never decide grants. */
  refreshAuthorization(): Promise<void> {
    if (!this.authorizationRefresh) this.authorizationRefresh = (async()=>{
      if (!await this.auth.ensureValidToken()) return;
      await this.auth.refreshBootstrap();
    })().finally(()=>{this.authorizationRefresh=null;});
    return this.authorizationRefresh;
  }

  private readonly base = `${environment.apiUrl}/rbac`;

  // ---------------------------------------------------------------------
  // Roles
  // ---------------------------------------------------------------------

  assignableRoles(): Observable<Role[]> {
    return this.http.get<ApiEnvelope<Role[]>>(`${this.base}/users/assignable-roles`).pipe(map(unwrap));
  }

  listRoles(): Observable<Role[]> {
    return this.http.get<ApiEnvelope<Role[]>>(`${this.base}/roles`).pipe(map(unwrap));
  }

  createRole(input: CreateRoleInput): Observable<Role> {
    return this.http.post<ApiEnvelope<Role>>(`${this.base}/roles`, input).pipe(map(unwrap));
  }

  updateRole(id: string, input: UpdateRoleInput): Observable<Role> {
    return this.http.patch<ApiEnvelope<Role>>(`${this.base}/roles/${id}`, input).pipe(map(unwrap));
  }

  deleteRole(id: string): Observable<{ id: string }> {
    return this.http.delete<ApiEnvelope<{ id: string }>>(`${this.base}/roles/${id}`).pipe(map(unwrap));
  }

  cloneRole(id: string, input: { key: string; name: string }): Observable<Role> {
    return this.http.post<ApiEnvelope<Role>>(`${this.base}/roles/${id}/clone`, input).pipe(map(unwrap));
  }

  setRoleStatus(id: string, isActive: boolean): Observable<Role> {
    return this.http
      .patch<ApiEnvelope<Role>>(`${this.base}/roles/${id}/status`, { isActive })
      .pipe(map(unwrap));
  }

  // ---------------------------------------------------------------------
  // Permissions + dashboard widgets
  // ---------------------------------------------------------------------

  permissionsCatalog(): Observable<PermissionCatalogNode[]> {
    return this.http
      .get<ApiEnvelope<PermissionCatalogNode[]>>(`${this.base}/permissions/catalog`)
      .pipe(map(unwrap));
  }

  /** The role's current grants as a flat list of `Permission.id`s — pre-checks the matrix. */
  rolePermissionIds(roleId: string): Observable<string[]> {
    return this.http
      .get<ApiEnvelope<{ permissionIds: string[] }>>(`${this.base}/roles/${roleId}/permissions`)
      .pipe(map((res) => unwrap(res).permissionIds));
  }

  setRolePermissions(roleId: string, permissionIds: string[]): Observable<unknown> {
    return this.http
      .put<ApiEnvelope<unknown>>(`${this.base}/roles/${roleId}/permissions`, { permissionIds })
      .pipe(map(unwrap));
  }

  listDashboardWidgets(): Observable<DashboardWidget[]> {
    return this.http
      .get<ApiEnvelope<DashboardWidget[]>>(`${this.base}/dashboard-widgets`)
      .pipe(map(unwrap));
  }

  roleWidgets(roleId:string): Observable<RoleWidgetLink[]> {
    return this.http.get<ApiEnvelope<RoleWidgetLink[]>>(`${this.base}/roles/${roleId}/widgets`).pipe(map(unwrap));
  }

  setRoleWidgets(roleId: string, widgets: { widgetId: string; order: number }[]): Observable<RoleWidgetLink[]> {
    return this.http
      .put<ApiEnvelope<RoleWidgetLink[]>>(`${this.base}/roles/${roleId}/widgets`, { widgets })
      .pipe(map(unwrap));
  }

  // ---------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------

  listUsers(page = 1, pageSize = 25, filters: {search?:string;roleId?:string;status?:string;sort?:string;direction?:string} = {}): Observable<Page<User & { roles: { role: Role }[] }>> {
    return this.http
      .get<ApiEnvelope<(User & { roles: { role: Role }[] })[]> & { meta?: { total?: number; page?: number; pageSize?: number } }>(
        `${this.base}/users`,
        { params: { page, pageSize, ...filters } },
      )
      .pipe(
        map((res) => ({
          items: unwrap(res),
          total: res.meta?.total ?? 0,
          page: res.meta?.page ?? page,
          pageSize: res.meta?.pageSize ?? pageSize,
        })),
      );
  }

  createUser(input: CreateUserInput): Observable<User> {
    return this.http.post<ApiEnvelope<User>>(`${this.base}/users`, input).pipe(map(unwrap));
  }

  updateUser(id: string, input: UpdateUserInput): Observable<User> {
    return this.http.patch<ApiEnvelope<User>>(`${this.base}/users/${id}`, input).pipe(map(unwrap));
  }

  deleteUser(id: string): Observable<{ id: string }> {
    return this.http.delete<ApiEnvelope<{ id: string }>>(`${this.base}/users/${id}`).pipe(map(unwrap));
  }

  assignRole(userId: string, roleId: string): Observable<User> {
    return this.http
      .post<ApiEnvelope<User>>(`${this.base}/users/${userId}/roles/${roleId}`, {})
      .pipe(map(unwrap));
  }

  removeRole(userId: string, roleId: string): Observable<User> {
    return this.http
      .delete<ApiEnvelope<User>>(`${this.base}/users/${userId}/roles/${roleId}`)
      .pipe(map(unwrap));
  }

  setUserStatus(userId: string, status: UserStatus): Observable<User> {
    return this.http
      .patch<ApiEnvelope<User>>(`${this.base}/users/${userId}/status`, { status })
      .pipe(map(unwrap));
  }

  revokeAllSessions(userId: string): Observable<{ message: string }> {
    return this.http
      .post<ApiEnvelope<{ message: string }>>(`${this.base}/users/${userId}/sessions/revoke-all`, {})
      .pipe(map(unwrap));
  }

  resetOtp(userId: string): Observable<{ message: string }> {
    return this.http
      .post<ApiEnvelope<{ message: string }>>(`${this.base}/users/${userId}/otp/reset`, {})
      .pipe(map(unwrap));
  }

  loginHistory(userId: string): Observable<LoginHistoryEntry[]> {
    return this.http
      .get<ApiEnvelope<LoginHistoryEntry[]>>(`${this.base}/users/${userId}/login-history`)
      .pipe(map(unwrap));
  }

  sessions(userId: string): Observable<DeviceSession[]> {
    return this.http
      .get<ApiEnvelope<DeviceSession[]>>(`${this.base}/users/${userId}/sessions`)
      .pipe(map(unwrap));
  }

  // ---------------------------------------------------------------------
  // Per-user permission overrides
  // ---------------------------------------------------------------------

  /** Role-derived grants layered with this user's overrides — what they can actually do right now. */
  effectivePermissions(userId: string): Observable<string[]> {
    return this.http
      .get<ApiEnvelope<{ permissions: string[] }>>(`${this.base}/users/${userId}/permissions/effective`)
      .pipe(map((res) => unwrap(res).permissions));
  }

  userPermissionOverrides(userId: string): Observable<{ grants: string[]; revokes: string[] }> {
    return this.http
      .get<ApiEnvelope<{ grants: string[]; revokes: string[] }>>(`${this.base}/users/${userId}/permission-overrides`)
      .pipe(map(unwrap));
  }

  setUserPermissionOverrides(userId: string, grants: string[], revokes: string[]): Observable<{ grants: string[]; revokes: string[] }> {
    return this.http
      .put<ApiEnvelope<{ grants: string[]; revokes: string[] }>>(`${this.base}/users/${userId}/permission-overrides`, { grants, revokes })
      .pipe(map(unwrap));
  }

  // ---------------------------------------------------------------------
  // Audit logs
  // ---------------------------------------------------------------------

  auditLogs(targetUserId?: string, page = 1, pageSize = 25): Observable<Page<AuditLogEntry>> {
    const params: Record<string, string | number> = { page, pageSize };
    if (targetUserId) params['targetUserId'] = targetUserId;
    return this.http
      .get<ApiEnvelope<AuditLogEntry[]> & { meta?: { total?: number; page?: number; pageSize?: number } }>(
        `${this.base}/audit-logs`,
        { params },
      )
      .pipe(
        map((res) => ({
          items: unwrap(res),
          total: res.meta?.total ?? 0,
          page: res.meta?.page ?? page,
          pageSize: res.meta?.pageSize ?? pageSize,
        })),
      );
  }
}

function unwrap<T>(res: ApiEnvelope<T>): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
