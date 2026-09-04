import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Notification } from '../../api/notifications';

const navigateMock = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

const listNotificationsMock = vi.fn();
const markNotificationReadMock = vi.fn();
const markAllNotificationsReadMock = vi.fn();

vi.mock('../../api/notifications', () => ({
  listNotifications: (...args: unknown[]) => listNotificationsMock(...args),
  markNotificationRead: (...args: unknown[]) => markNotificationReadMock(...args),
  markAllNotificationsRead: (...args: unknown[]) => markAllNotificationsReadMock(...args),
}));

import { NotificationBell } from './notification-bell';

const DEAL_NOTIFICATION: Notification = {
  id: 'notif-1',
  recipientUserId: 'user-1',
  recipientType: 'SUPERADMIN',
  type: 'DEAL_PENDING_APPROVAL',
  title: 'New Deal Pending Approval',
  message: 'ABC Vendor submitted "Premium Spa Deal" for approval.',
  entityType: 'DEAL',
  entityId: 'deal-1',
  metadata: { vendorId: 'vendor-1', branchId: 'branch-1' },
  isRead: false,
  readAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const ORDER_NOTIFICATION: Notification = {
  ...DEAL_NOTIFICATION,
  id: 'notif-2',
  recipientType: 'VENDOR',
  type: 'ORDER_RECEIVED',
  title: 'New Order Received',
  message: 'You have received a new order #ORD-0000001.',
  entityType: 'ORDER',
  entityId: 'order-1',
  metadata: null,
  isRead: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  markNotificationReadMock.mockResolvedValue({ data: { updated: true } });
  markAllNotificationsReadMock.mockResolvedValue({ data: { updated: true } });
});

/**
 * Feature: NotificationBell — header bell + dropdown for the caller's own notification inbox
 * Scenario: renders an unread badge from the list response's meta, opens a dropdown showing
 * recent notifications, marks one read + navigates on click, supports mark-all-read, and shows
 * an empty state when there are none.
 *
 * NOTE: like `search.test.tsx`'s documented `@lit/react`+React 19 limitation, this suite avoids
 * asserting on `<md-menu>`'s own open/closed internal state directly — it verifies behaviorally
 * (the bell button always renders regardless of dropdown state; clicking a real DOM button
 * inside the rendered dropdown content still dispatches a real React onClick, which IS testable).
 */
/** `<md-icon-button>`'s Material-internals-assigned role isn't understood by jsdom's
 *  accessibility tree (same documented gap as `vendor-wizard-modules.test.tsx`'s
 *  `findSaveButton`), and its `id` prop doesn't reliably reflect as a DOM attribute under
 *  `@lit/react` + jsdom either (same family of binding gaps `search.test.tsx` documents) — query
 *  the custom element by tag name instead; this component renders exactly one. */
function bellButton(): HTMLElement {
  const el = document.querySelector('md-icon-button');
  if (!el) throw new Error('Notification bell button not found');
  return el as HTMLElement;
}

describe('NotificationBell', () => {
  it('renders the bell and shows the unread count badge from the list response', async () => {
    listNotificationsMock.mockResolvedValue({ data: [DEAL_NOTIFICATION, ORDER_NOTIFICATION], meta: { total: 2, unreadCount: 1 } });
    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByText('1')).toBeTruthy());
  });

  it('shows no badge when unreadCount is 0', async () => {
    listNotificationsMock.mockResolvedValue({ data: [ORDER_NOTIFICATION], meta: { total: 1, unreadCount: 0 } });
    render(<NotificationBell />);
    await waitFor(() => expect(listNotificationsMock).toHaveBeenCalled());
    expect(screen.queryByText('0')).toBeNull();
  });

  it('opens the dropdown on click and lists the loaded notifications', async () => {
    listNotificationsMock.mockResolvedValue({ data: [DEAL_NOTIFICATION], meta: { total: 1, unreadCount: 1 } });
    render(<NotificationBell />);
    await waitFor(() => expect(listNotificationsMock).toHaveBeenCalled());
    fireEvent.click(bellButton());
    await waitFor(() => expect(screen.getByText('New Deal Pending Approval')).toBeTruthy());
    expect(screen.getByText(DEAL_NOTIFICATION.message)).toBeTruthy();
  });

  it('shows the empty state when there are no notifications', async () => {
    listNotificationsMock.mockResolvedValue({ data: [], meta: { total: 0, unreadCount: 0 } });
    render(<NotificationBell />);
    await waitFor(() => expect(listNotificationsMock).toHaveBeenCalled());
    fireEvent.click(bellButton());
    await waitFor(() => expect(screen.getByText('No notifications yet')).toBeTruthy());
  });

  it('clicking a DEAL notification marks it read and navigates to the vendor/branch/deal deep link', async () => {
    listNotificationsMock.mockResolvedValue({ data: [DEAL_NOTIFICATION], meta: { total: 1, unreadCount: 1 } });
    render(<NotificationBell />);
    await waitFor(() => expect(listNotificationsMock).toHaveBeenCalled());
    fireEvent.click(bellButton());
    await waitFor(() => expect(screen.getByText('New Deal Pending Approval')).toBeTruthy());

    fireEvent.click(screen.getByText('New Deal Pending Approval'));

    await waitFor(() => expect(markNotificationReadMock).toHaveBeenCalledWith('test-token', 'notif-1'));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/account/vendors?vendorId=vendor-1&branchId=branch-1&dealId=deal-1'),
    );
  });

  it('clicking an already-read ORDER notification navigates without calling markNotificationRead again', async () => {
    listNotificationsMock.mockResolvedValue({ data: [ORDER_NOTIFICATION], meta: { total: 1, unreadCount: 0 } });
    render(<NotificationBell />);
    await waitFor(() => expect(listNotificationsMock).toHaveBeenCalled());
    fireEvent.click(bellButton());
    await waitFor(() => expect(screen.getByText('New Order Received')).toBeTruthy());

    fireEvent.click(screen.getByText('New Order Received'));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/account/orders?orderId=order-1'));
    expect(markNotificationReadMock).not.toHaveBeenCalled();
  });

  it('"Mark all read" calls markAllNotificationsRead and refetches', async () => {
    listNotificationsMock.mockResolvedValue({ data: [DEAL_NOTIFICATION], meta: { total: 1, unreadCount: 1 } });
    render(<NotificationBell />);
    await waitFor(() => expect(listNotificationsMock).toHaveBeenCalled());
    fireEvent.click(bellButton());
    await waitFor(() => expect(screen.getByText('Mark all read')).toBeTruthy());

    fireEvent.click(screen.getByText('Mark all read'));

    await waitFor(() => expect(markAllNotificationsReadMock).toHaveBeenCalledWith('test-token'));
    await waitFor(() => expect(listNotificationsMock).toHaveBeenCalledTimes(2)); // initial load + post-mark-all refetch
  });
});
