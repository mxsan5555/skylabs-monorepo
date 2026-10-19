import type { DeviceSession, LoginHistoryEntry, UserStatus } from '@skylabs-monorepo/shared-types';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './client';

export interface UserRecord {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  roles: { id: string; key: string; name: string }[];
}

/** A staff user holds exactly one role — `roleId` is required and singular everywhere a role is
 *  assigned (creation, and the atomic replace via `setUserRole` below). */
export interface UserCreateInput {
  name: string;
  email?: string;
  phone?: string;
  roleId: string;
}

export interface UserUpdateInput {
  name?: string;
  email?: string;
  phone?: string;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export function listUsers(
  token: string | null,
  opts: { page?: number; pageSize?: number; search?: string; roleKey?: string } = {},
) {
  const { page = 1, pageSize = 20, search, roleKey } = opts;
  return apiGet<UserRecord[]>(`/rbac/users${toQuery({ page, pageSize, search, roleKey })}`, token);
}

export function getUser(token: string | null, id: string) {
  return apiGet<UserRecord>(`/rbac/users/${id}`, token);
}

export function createUser(token: string | null, input: UserCreateInput) {
  return apiPost<UserRecord>('/rbac/users', token, input);
}

export function updateUser(token: string | null, id: string, input: UserUpdateInput) {
  return apiPatch<UserRecord>(`/rbac/users/${id}`, token, input);
}

export function deleteUser(token: string | null, id: string) {
  return apiDelete<null>(`/rbac/users/${id}`, token);
}

export function setUserStatus(token: string | null, id: string, status: UserStatus) {
  return apiPatch<UserRecord>(`/rbac/users/${id}/status`, token, { status });
}

/** Atomically replaces the user's entire role set with exactly this one role — never additive.
 *  See `user.service.ts#setStaffUserRole`'s own doc comment for the single-role model. */
export function setUserRole(token: string | null, userId: string, roleId: string) {
  return apiPut<UserRecord>(`/rbac/users/${userId}/role`, token, { roleId });
}

export interface RoleConflictAccount {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  roles: { id: string; key: string; name: string }[];
  vendorProfile: { id: string; businessName: string | null } | null;
}

/** Legacy accounts still holding more than one role, flagged for an authorized admin to resolve
 *  by picking one explicit final role — see `prisma/role-migration.ts`'s own doc comment. */
export function listRoleConflicts(token: string | null) {
  return apiGet<RoleConflictAccount[]>('/rbac/role-conflicts', token);
}

export function resolveRoleConflict(token: string | null, userId: string, roleId: string) {
  return apiPut<UserRecord>(`/rbac/role-conflicts/${userId}`, token, { roleId });
}

export function revokeAllSessions(token: string | null, userId: string) {
  return apiPost<{ revoked: boolean }>(`/rbac/users/${userId}/sessions/revoke-all`, token);
}

export function resetOtp(token: string | null, userId: string) {
  return apiPost<{ reset: boolean }>(`/rbac/users/${userId}/otp/reset`, token);
}

export function getLoginHistory(token: string | null, userId: string, page = 1, pageSize = 20) {
  return apiGet<LoginHistoryEntry[]>(`/rbac/users/${userId}/login-history?page=${page}&pageSize=${pageSize}`, token);
}

export function getSessions(token: string | null, userId: string) {
  return apiGet<DeviceSession[]>(`/rbac/users/${userId}/sessions`, token);
}
