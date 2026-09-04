import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, PrimaryTab, FilledButton, OutlinedButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listNotifications, markNotificationRead, markAllNotificationsRead, type Notification } from '../../../../api/notifications';
import { ApiRequestError } from '../../../../api/rbac/client';
import { formatRelativeTime } from '../../../../utils/format';

const PAGE_SIZE = 50;

/**
 * Reachable only via the header bell's "View all notifications" link (see notification-bell.tsx)
 * — deliberately not in `packages/shared-menu`'s sidebar, since every console user (Vendor or
 * Superadmin alike) should reach their own inbox regardless of RBAC permissions, and that file
 * drives permission-gated visibility. "Unread" is filtered client-side from the same loaded page
 * (notification volume per user is small — no need for a second backend query param).
 */
export function NotificationsPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'all' | 'unread'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await listNotifications(token, { pageSize: PAGE_SIZE });
      setNotifications(data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = tab === 'unread' ? notifications.filter((n) => !n.isRead) : notifications;

  async function openNotification(notification: Notification) {
    if (!notification.isRead) {
      await markNotificationRead(token, notification.id);
      await load();
    }
    if (notification.entityType === 'DEAL') {
      const meta = notification.metadata as { vendorId?: string; branchId?: string } | null;
      navigate(`/account/vendors?vendorId=${meta?.vendorId ?? ''}&branchId=${meta?.branchId ?? ''}&dealId=${notification.entityId ?? ''}`);
    } else if (notification.entityType === 'ORDER') {
      navigate(`/account/orders?orderId=${notification.entityId ?? ''}`);
    }
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead(token);
    await load();
  }

  return (
    <div className="admin-page">
      <title>Notifications · MSD</title>
      <header className="page-head">
        <div>
          <h1>Notifications</h1>
        </div>
        {notifications.some((n) => !n.isRead) && <OutlinedButton onClick={handleMarkAllRead}>Mark all read</OutlinedButton>}
      </header>

      <div className="admin-tabs-wrap">
        <Tabs className="admin-tabs" onChange={(e) => setTab((e.target as unknown as { activeTabIndex: number }).activeTabIndex === 1 ? 'unread' : 'all')}>
          <PrimaryTab active={tab === 'all'}>All</PrimaryTab>
          <PrimaryTab active={tab === 'unread'}>Unread</PrimaryTab>
        </Tabs>
      </div>

      {error && <p className="error-state" role="alert">{error}</p>}

      {loading ? (
        <p className="loading-state">Loading notifications…</p>
      ) : visible.length === 0 ? (
        <div className="empty-state">
          <Icon aria-hidden="true">notifications</Icon>
          <p>No notifications yet</p>
          <p className="field-hint">You're all caught up.</p>
        </div>
      ) : (
        <ul className="entity-list">
          {visible.map((notification) => (
            <li key={notification.id}>
              <div className={`entity-list__item${notification.isRead ? '' : ' entity-list__item--highlighted'}`}>
                <div>
                  <p className="role-list__name">{notification.title}</p>
                  <p className="field-hint">{notification.message}</p>
                  <p className="field-hint">{formatRelativeTime(notification.createdAt)}</p>
                </div>
                <FilledButton onClick={() => openNotification(notification)}>
                  {notification.entityType === 'DEAL' ? 'Review Deal' : notification.entityType === 'ORDER' ? 'View Order' : 'View'}
                </FilledButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default NotificationsPage;
