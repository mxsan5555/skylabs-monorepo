import type { AuditLogEntry } from '@skylabs-monorepo/shared-types';
import { apiGet } from './client';

export interface AuditLogQuery {
  targetUserId?: string;
  page?: number;
  pageSize?: number;
}

export function listAuditLogs(token: string | null, query: AuditLogQuery = {}) {
  const params = new URLSearchParams();
  if (query.targetUserId) params.set('targetUserId', query.targetUserId);
  params.set('page', String(query.page ?? 1));
  params.set('pageSize', String(query.pageSize ?? 20));
  return apiGet<AuditLogEntry[]>(`/rbac/audit-logs?${params.toString()}`, token);
}
