import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconButton, Icon, Menu, MenuItem, TextButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listNotifications, markNotificationRead, markAllNotificationsRead, type Notification } from '../../api/notifications';
import { formatRelativeTime } from '../../utils/format';
import './notification-bell.css';

const POLL_INTERVAL_MS = 30_000;
const DROPDOWN_PAGE_SIZE = 8;

/**
 * Dropped into `AdminLayout`'s `.admin-topbar` — renders for every authenticated console user
 * regardless of role (Vendor or Superadmin); the backend already scopes `/notifications` to
 * `req.user.sub`, so this component never needs to know or care which persona is logged in.
 * No real-time push exists in this app (confirmed — no WebSockets/SSE/react-query anywhere), so
 * this polls on a plain interval, the lightweight option the notification-system plan calls for
 * rather than introducing new infrastructure for a single feature.
 */
export function NotificationBell() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const { data, meta } = await listNotifications(token, { pageSize: DROPDOWN_PAGE_SIZE });
      setNotifications(data);
      setUnreadCount(meta?.unreadCount ?? 0);
      setLoaded(true);
    } catch {
      // A failed poll must never break the surrounding admin console — just skip this tick.
    }
  }, [token]);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  async function handleMarkAllRead() {
    if (!token) return;
    await markAllNotificationsRead(token);
    await load();
  }

  async function handleNotificationClick(notification: Notification) {
    setOpen(false);
    if (!notification.isRead && token) {
      try {
        await markNotificationRead(token, notification.id);
      } catch {
        // Navigation should still happen even if the mark-read call fails — the user's intent
        // (open the thing this notification is about) matters more than the read receipt.
      }
      await load();
    }
    if (notification.entityType === 'DEAL') {
      const meta = notification.metadata as { vendorId?: string; branchId?: string } | null;
      navigate(`/account/vendors?vendorId=${meta?.vendorId ?? ''}&branchId=${meta?.branchId ?? ''}&dealId=${notification.entityId ?? ''}`);
    } else if (notification.entityType === 'ORDER') {
      navigate(`/account/orders?orderId=${notification.entityId ?? ''}`);
    } else if (notification.entityType === 'VENDOR') {
      const meta = notification.metadata as { vendorId?: string } | null;
      navigate(`/account/vendors?vendorId=${meta?.vendorId ?? notification.entityId ?? ''}`);
    }
  }

  return (
    <div className="notification-bell">
      <IconButton
        id="notification-bell-button"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon aria-hidden="true">notifications</Icon>
        {unreadCount > 0 && <span className="notification-bell__badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </IconButton>

      {open && (
        <Menu open anchor="notification-bell-button" yOffset={8} onClosed={() => setOpen(false)}>
          <div className="notification-bell__header">
            <span className="notification-bell__header-title">Notifications</span>
            {unreadCount > 0 && (
              <button type="button" className="notification-bell__mark-all" onClick={handleMarkAllRead}>
                Mark all read
              </button>
            )}
          </div>

          {loaded && notifications.length === 0 ? (
            <div className="notification-bell__empty">
              <Icon aria-hidden="true">notifications</Icon>
              <p>No notifications yet</p>
              <p className="notification-bell__empty-sub">You're all caught up.</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <MenuItem
                key={notification.id}
                className={`notification-bell__item${notification.isRead ? '' : ' notification-bell__item--unread'}`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="notification-bell__item-body">
                  {!notification.isRead && <span className="notification-bell__dot" aria-hidden="true" />}
                  <div>
                    <p className="notification-bell__item-title">{notification.title}</p>
                    <p className="notification-bell__item-message">{notification.message}</p>
                    <p className="notification-bell__item-time">{formatRelativeTime(notification.createdAt)}</p>
                  </div>
                </div>
              </MenuItem>
            ))
          )}

          <div className="notification-bell__footer">
            <TextButton
              onClick={() => {
                setOpen(false);
                navigate('/account/notifications');
              }}
            >
              View all notifications
            </TextButton>
          </div>
        </Menu>
      )}
    </div>
  );
}

export default NotificationBell;
