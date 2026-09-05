import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../lib/prisma';
import {
  notifySuperAdmins,
  notifyVendorOwner,
  notifyOrderConfirmed,
  shortOrderNumber,
  markNotificationRead,
  markAllNotificationsRead,
  listNotificationsForUser,
} from './notification.service';

const prismaMock = vi.mocked(prisma, true);

// `$transaction`'s callback form (see prisma-mock.ts) invokes the callback with the same mock
// standing in for `tx` — every function under test here takes a `tx`, so passing `prismaMock`
// itself directly is equivalent to how the real call sites invoke it inside `prisma.$transaction`.
const tx = prismaMock;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('notifySuperAdmins', () => {
  it('creates one notification row per User with an isSuperAdmin-flagged, active Role', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]);
    await notifySuperAdmins(tx, { type: 'DEAL_PENDING_APPROVAL', title: 'T', message: 'M', entityType: 'DEAL', entityId: 'deal-1' });
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: { roles: { some: { role: { isSuperAdmin: true, isActive: true } } } },
      select: { id: true },
    });
    expect(prismaMock.notification.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ recipientUserId: 'admin-1', recipientType: 'SUPERADMIN' }) }),
    );
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ recipientUserId: 'admin-2', recipientType: 'SUPERADMIN' }) }),
    );
  });

  it('creates zero notifications when no Superadmin user exists', async () => {
    prismaMock.user.findMany.mockResolvedValue([]);
    await notifySuperAdmins(tx, { type: 'ORDER_RECEIVED', title: 'T', message: 'M' });
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });
});

describe('notifyVendorOwner', () => {
  it('creates a VENDOR notification for the vendor\'s ownerUserId', async () => {
    prismaMock.vendor.findUnique.mockResolvedValue({ ownerUserId: 'owner-1' });
    await notifyVendorOwner(tx, 'vendor-1', { type: 'ORDER_RECEIVED', title: 'T', message: 'M', entityType: 'ORDER', entityId: 'order-1' });
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ recipientUserId: 'owner-1', recipientType: 'VENDOR' }) }),
    );
  });

  it('no-ops (does not throw) when the vendor has no ownerUserId yet (unclaimed admin-created vendor)', async () => {
    prismaMock.vendor.findUnique.mockResolvedValue({ ownerUserId: null });
    await expect(notifyVendorOwner(tx, 'vendor-1', { type: 'ORDER_RECEIVED', title: 'T', message: 'M' })).resolves.toBeUndefined();
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });

  it('no-ops when the vendor itself is not found', async () => {
    prismaMock.vendor.findUnique.mockResolvedValue(null);
    await expect(notifyVendorOwner(tx, 'missing-vendor', { type: 'ORDER_RECEIVED', title: 'T', message: 'M' })).resolves.toBeUndefined();
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });
});

describe('shortOrderNumber', () => {
  it('derives a display label from the last 8 chars of the order id, uppercased', () => {
    expect(shortOrderNumber('c0c0c0c0-0000-4000-8000-00000000abcd')).toBe('ORD-0000ABCD');
  });
});

describe('notifyOrderConfirmed', () => {
  it('notifies each DISTINCT vendor among the order\'s OrderItems exactly once, plus one Superadmin notification', async () => {
    prismaMock.orderItem.findMany.mockResolvedValue([{ vendorId: 'vendor-A' }, { vendorId: 'vendor-A' }, { vendorId: 'vendor-B' }]);
    prismaMock.vendor.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === 'vendor-A' ? { ownerUserId: 'owner-A' } : { ownerUserId: 'owner-B' }),
    );
    prismaMock.user.findMany.mockResolvedValue([{ id: 'superadmin-1' }]);

    await notifyOrderConfirmed(tx, 'order-1');

    // Exactly one notification per distinct vendor (never duplicated for vendor-A's 2 items) +
    // exactly one Superadmin notification for the order as a whole.
    expect(prismaMock.notification.create).toHaveBeenCalledTimes(3);
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ recipientUserId: 'owner-A', recipientType: 'VENDOR', entityId: 'order-1' }) }),
    );
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ recipientUserId: 'owner-B', recipientType: 'VENDOR', entityId: 'order-1' }) }),
    );
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ recipientUserId: 'superadmin-1', recipientType: 'SUPERADMIN', entityId: 'order-1' }) }),
    );
  });

  it('creates zero notifications when the order has no items (defensive — never throws)', async () => {
    prismaMock.orderItem.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([]);
    await notifyOrderConfirmed(tx, 'order-empty');
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });
});

describe('markNotificationRead', () => {
  it('updates only when the notification belongs to the caller (ownership-scoped)', async () => {
    prismaMock.notification.updateMany.mockResolvedValue({ count: 1 });
    await markNotificationRead('user-1', 'notif-1');
    expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'notif-1', recipientUserId: 'user-1' },
      data: expect.objectContaining({ isRead: true }),
    });
  });

  it('throws NOT_FOUND (never confirming the id exists for someone else) when 0 rows are affected', async () => {
    prismaMock.notification.updateMany.mockResolvedValue({ count: 0 });
    await expect(markNotificationRead('user-1', 'someone-elses-notif')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('markAllNotificationsRead', () => {
  it('scopes the bulk update to only the caller\'s own unread notifications', async () => {
    prismaMock.notification.updateMany.mockResolvedValue({ count: 3 });
    await markAllNotificationsRead('user-1');
    expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
      where: { recipientUserId: 'user-1', isRead: false },
      data: expect.objectContaining({ isRead: true }),
    });
  });
});

describe('listNotificationsForUser', () => {
  it('returns items/total/unreadCount all scoped to the caller', async () => {
    prismaMock.notification.findMany.mockResolvedValue([{ id: 'n1' }]);
    prismaMock.notification.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2);
    const result = await listNotificationsForUser('user-1', { page: 1, pageSize: 20 });
    expect(result).toEqual({ items: [{ id: 'n1' }], total: 5, unreadCount: 2 });
    expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { recipientUserId: 'user-1' } }),
    );
  });
});
