import type { Notification } from '../../api/notifications';

const part = (value: string) => encodeURIComponent(value);

function metaString(notification: Notification, key: string): string | undefined {
  const value = notification.metadata?.[key];
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * Where a notification opens in the account console, or null when it has no target. A deal
 * notification opens the deal itself (`/account/members/:vendorId/deals/:dealId`), falling back to
 * the member's deals tab, then the member list. Used by the header bell and the notifications page.
 */
export function notificationLink(notification: Notification): string | null {
  const { entityType, entityId } = notification;
  if (entityType === 'DEAL') {
    const vendorId = metaString(notification, 'vendorId');
    if (!vendorId) return '/account/members';
    return entityId ? `/account/members/${part(vendorId)}/deals/${part(entityId)}` : `/account/members/${part(vendorId)}/deals`;
  }
  if (entityType === 'ORDER') return `/account/orders?orderId=${part(entityId ?? '')}`;
  if (entityType === 'VENDOR') {
    const vendorId = metaString(notification, 'vendorId') ?? entityId;
    return vendorId ? `/account/members/${part(vendorId)}` : '/account/members';
  }
  return null;
}
