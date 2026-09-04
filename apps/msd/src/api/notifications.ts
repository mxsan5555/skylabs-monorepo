import { apiGet, apiPatch } from './rbac/client';

export type NotificationRecipientType = 'SUPERADMIN' | 'VENDOR';
export type NotificationType = 'DEAL_PENDING_APPROVAL' | 'ORDER_RECEIVED' | 'VENDOR_PENDING_APPROVAL';

export interface Notification {
  id: string;
  recipientUserId: string;
  recipientType: NotificationRecipientType;
  type: NotificationType;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

/** The caller's own notification inbox — always scoped server-side to the caller's own JWT, never
 *  a client-supplied recipient id (see notifications.routes.ts's own doc comment). */
export function listNotifications(token: string | null, opts: { page?: number; pageSize?: number } = {}) {
  return apiGet<Notification[]>(`/notifications${toQuery(opts)}`, token);
}

export function markNotificationRead(token: string | null, id: string) {
  return apiPatch<{ updated: boolean }>(`/notifications/${id}/read`, token, undefined);
}

export function markAllNotificationsRead(token: string | null) {
  return apiPatch<{ updated: boolean }>('/notifications/read-all', token, undefined);
}
