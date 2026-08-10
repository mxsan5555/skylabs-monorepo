import type { PermissionAction, Role } from '@skylabs-monorepo/shared-types';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './client';

export type { Role };

export interface RoleCreateInput {
  key: string;
  name: string;
  description?: string;
  isActive?: boolean;
}

export interface RoleUpdateInput {
  name?: string;
  description?: string;
  isActive?: boolean;
}

/** One `(menuKey, action)` cell in the permission matrix — `permissionId` is null if no Permission row exists yet for that pair (nothing to grant). */
export interface PermissionCatalogAction {
  action: PermissionAction;
  key: string;
  permissionId: string | null;
  label: string | null;
}

export interface PermissionCatalogRow {
  menuKey: string;
  title: string;
  actions: PermissionCatalogAction[];
}

export interface RolePermissionRow {
  roleId: string;
  permissionId: string;
  permission: { id: string; key: string; menuKey: string; action: PermissionAction; label: string };
}

export interface DashboardWidgetRecord {
  id: string;
  key: string;
  title: string;
  module: string;
  description?: string;
}

export interface RoleWidgetRow {
  roleId: string;
  widgetId: string;
  order: number;
  widget: DashboardWidgetRecord;
}

export function listRoles(token: string | null) {
  return apiGet<Role[]>('/rbac/roles', token);
}

export function createRole(token: string | null, input: RoleCreateInput) {
  return apiPost<Role>('/rbac/roles', token, input);
}

export function updateRole(token: string | null, id: string, input: RoleUpdateInput) {
  return apiPatch<Role>(`/rbac/roles/${id}`, token, input);
}

export function deleteRole(token: string | null, id: string) {
  return apiDelete<null>(`/rbac/roles/${id}`, token);
}

export function cloneRole(token: string | null, id: string, key: string, name: string) {
  return apiPost<Role>(`/rbac/roles/${id}/clone`, token, { key, name });
}

export function setRoleStatus(token: string | null, id: string, isActive: boolean) {
  return apiPatch<Role>(`/rbac/roles/${id}/status`, token, { isActive });
}

export function getPermissionCatalog(token: string | null) {
  return apiGet<PermissionCatalogRow[]>('/rbac/permissions/catalog', token);
}

export function getRolePermissionIds(token: string | null, id: string) {
  return apiGet<{ permissionIds: string[] }>(`/rbac/roles/${id}/permissions`, token);
}

export function setRolePermissions(token: string | null, id: string, permissionIds: string[]) {
  return apiPut<RolePermissionRow[]>(`/rbac/roles/${id}/permissions`, token, { permissionIds });
}

export function setRoleWidgets(token: string | null, id: string, widgets: { widgetId: string; order: number }[]) {
  return apiPut<RoleWidgetRow[]>(`/rbac/roles/${id}/widgets`, token, { widgets });
}

export function listDashboardWidgetsCatalog(token: string | null) {
  return apiGet<DashboardWidgetRecord[]>('/rbac/dashboard-widgets', token);
}
