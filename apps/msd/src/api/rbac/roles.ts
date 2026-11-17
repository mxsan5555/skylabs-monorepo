import type {
  PermissionAction,
  Role,
} from '@skylabs-monorepo/shared-types';

import {
  apiGet,
  apiPatch,
  apiPut,
} from './client';

export type { Role };

export type PermissionScope = 'ALL' | 'OWN';

export interface RoleUpdateInput {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface PermissionCatalogAction {
  action: PermissionAction;
  /** Every real `${menuKey}:${action}` key this action represents, comma-joined (usually one;
   *  more than one only for a resource that aggregates several real keys, e.g. Content). */
  key: string;
  /** The real `Permission.id`s this one UI action controls — toggling it grants/revokes all of
   *  them together. Empty when the backend hasn't created the row(s) yet (needs a reseed). */
  permissionIds: string[];
  label: string | null;
}

export interface PermissionCatalogRow {
  id: string;
  menuKey: string;
  title: string;
  actions: PermissionCatalogAction[];
}

export interface RolePermissionAssignment {
  permissionId: string;
  scope: PermissionScope;
}

export interface RolePermissionRecord extends RolePermissionAssignment {
  permission?: unknown;
}

export interface RolePermissionResponse {
  roleId: string;
  permissionId: string;
  scope: PermissionScope;
  permission: {
    id: string;
    key: string;
    menuKey: string;
    action: PermissionAction;
    label: string;
  };
}

export interface SetRolePermissionsInput {
  permissions: RolePermissionAssignment[];
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

export interface RoleWidgetAssignment {
  widgetId: string;
  order: number;
}

export function listRoles(token: string | null) {
  return apiGet<Role[]>('/rbac/roles', token);
}

export function updateRole(
  token: string | null,
  id: string,
  input: RoleUpdateInput,
) {
  return apiPatch<Role>(
    `/rbac/roles/${id}`,
    token,
    input,
  );
}

export function setRoleStatus(
  token: string | null,
  id: string,
  isActive: boolean,
) {
  return apiPatch<Role>(
    `/rbac/roles/${id}/status`,
    token,
    { isActive },
  );
}

export function getPermissionCatalog(
  token: string | null,
) {
  return apiGet<PermissionCatalogRow[]>(
    '/rbac/permissions/catalog',
    token,
  );
}

export function getRolePermissions(
  token: string | null,
  id: string,
) {
  return apiGet<RolePermissionResponse[]>(
    `/rbac/roles/${id}/permissions`,
    token,
  );
}

export function setRolePermissions(
  token: string | null,
  roleId: string,
  permissions: RolePermissionAssignment[],
) {
  return apiPut<RolePermissionRecord[]>(
    `/rbac/roles/${roleId}/permissions`,
    token,
    { permissions },
  );
}

export function getRoleWidgets(
  token: string | null,
  id: string,
) {
  return apiGet<RoleWidgetRow[]>(
    `/rbac/roles/${id}/widgets`,
    token,
  );
}

export function setRoleWidgets(
  token: string | null,
  id: string,
  widgets: RoleWidgetAssignment[],
) {
  return apiPut<RoleWidgetRow[]>(
    `/rbac/roles/${id}/widgets`,
    token,
    { widgets },
  );
}

export function listDashboardWidgetsCatalog(
  token: string | null,
) {
  return apiGet<DashboardWidgetRecord[]>(
    '/rbac/dashboard-widgets',
    token,
  );
}