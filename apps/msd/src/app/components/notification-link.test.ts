import { describe, it, expect } from 'vitest';
import type { Notification } from '../../api/notifications';
import { notificationLink } from './notification-link';

function note(partial: Partial<Notification>): Notification {
  return {
    id: 'n1',
    recipientUserId: 'u1',
    recipientType: 'SUPERADMIN',
    type: 'DEAL_PENDING_APPROVAL',
    title: 't',
    message: 'm',
    entityType: 'DEAL',
    entityId: 'deal-1',
    metadata: { vendorId: 'vendor-1', branchId: 'branch-1' },
    isRead: false,
    readAt: null,
    createdAt: '2026-10-16T00:00:00.000Z',
    updatedAt: '2026-10-16T00:00:00.000Z',
    ...partial,
  };
}

describe('notificationLink', () => {
  it('opens the deal itself for a deal notification', () => {
    expect(notificationLink(note({}))).toBe('/account/members/vendor-1/deals/deal-1');
  });

  it('falls back to the member deals tab when the deal id is missing', () => {
    expect(notificationLink(note({ entityId: null }))).toBe('/account/members/vendor-1/deals');
  });

  it('falls back to the member list when the member id is missing', () => {
    expect(notificationLink(note({ metadata: null }))).toBe('/account/members');
  });

  it('opens the member page for a vendor notification', () => {
    expect(notificationLink(note({ entityType: 'VENDOR', entityId: 'vendor-2', metadata: null }))).toBe('/account/members/vendor-2');
  });

  it('opens the order for an order notification', () => {
    expect(notificationLink(note({ entityType: 'ORDER', entityId: 'order-1', metadata: null }))).toBe('/account/orders?orderId=order-1');
  });

  it('encodes ids so a stray character never changes the route', () => {
    expect(notificationLink(note({ entityId: 'a/b', metadata: { vendorId: 'v 1' } }))).toBe('/account/members/v%201/deals/a%2Fb');
  });
});
