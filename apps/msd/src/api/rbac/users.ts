import type { DeviceSession, LoginHistoryEntry, UserStatus } from '@skylabs-monorepo/shared-types';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

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

export interface UserCreateInput {
  name: string;
  email?: string;
  phone?: string;
  roleIds?: string[];
}

export interface UserUpdateInput {
  name?: string;
  email?: string;
  phone?: string;
}

export function listUsers(token: string | null, page = 1, pageSize = 20) {
  return apiGet<UserRecord[]>(`/rbac/users?page=${page}&pageSize=${pageSize}`, token);
}

export function createUser(token: string | null, input: UserCreateInput) {
  return apiPost<UserRecord>('/rbac/users', token, { roleIds: [], ...input });
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

export function assignRole(token: string | null, userId: string, roleId: string) {
  return apiPost<{ assigned: boolean }>(`/rbac/users/${userId}/roles/${roleId}`, token);
}

export function unassignRole(token: string | null, userId: string, roleId: string) {
  return apiDelete<{ assigned: boolean }>(`/rbac/users/${userId}/roles/${roleId}`, token);
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
