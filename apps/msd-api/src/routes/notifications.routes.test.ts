import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

import app from '../app';
import { prisma } from '../lib/prisma';
import { bearerFor } from '../test-utils/auth-test-utils';

const prismaMock = vi.mocked(prisma, true);

const USER_A = 'a0a0a0a0-0000-4000-8000-000000000001';
const NOTIF_ID = 'b0b0b0b0-0000-4000-8000-000000000002';

const notifFixture = {
  id: NOTIF_ID,
  recipientUserId: USER_A,
  recipientType: 'VENDOR',
  type: 'ORDER_RECEIVED',
  title: 'New Order Received',
  message: 'You have received a new order #ORD-00000001.',
  entityType: 'ORDER',
  entityId: 'order-1',
  metadata: null,
  isRead: false,
  readAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Feature: `/notifications` — the caller's own inbox, ownership-scoped via the JWT, never RBAC-
 * scoped (no `requirePermission`) — every authenticated user, Vendor or Superadmin, reaches only
 * their own rows.
 */
describe('GET /api/v1/notifications', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/v1/notifications');
    expect(res.status).toBe(401);
  });

  it('returns the caller\'s own notifications with total + unreadCount in meta', async () => {
    prismaMock.notification.findMany.mockResolvedValue([notifFixture]);
    prismaMock.notification.count.mockResolvedValueOnce(4).mockResolvedValueOnce(1);
    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', bearerFor({ sub: USER_A, roles: ['vendor'] }));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([notifFixture]);
    expect(res.body.meta).toEqual(expect.objectContaining({ total: 4, unreadCount: 1 }));
    expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { recipientUserId: USER_A } }),
    );
  });

  it('never resolves the recipient from a client-supplied id — only from the JWT', async () => {
    prismaMock.notification.findMany.mockResolvedValue([]);
    prismaMock.notification.count.mockResolvedValue(0);
    await request(app)
      .get('/api/v1/notifications?recipientUserId=someone-elses-id')
      .set('Authorization', bearerFor({ sub: USER_A, roles: ['vendor'] }));
    expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { recipientUserId: USER_A } }),
    );
  });
});

describe('PATCH /api/v1/notifications/:id/read', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).patch(`/api/v1/notifications/${NOTIF_ID}/read`);
    expect(res.status).toBe(401);
  });

  it('marks the caller\'s own notification read', async () => {
    prismaMock.notification.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app)
      .patch(`/api/v1/notifications/${NOTIF_ID}/read`)
      .set('Authorization', bearerFor({ sub: USER_A, roles: ['vendor'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
      where: { id: NOTIF_ID, recipientUserId: USER_A },
      data: expect.objectContaining({ isRead: true }),
    });
  });

  it('404s (never confirming existence) when the notification belongs to another user', async () => {
    prismaMock.notification.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app)
      .patch(`/api/v1/notifications/${NOTIF_ID}/read`)
      .set('Authorization', bearerFor({ sub: 'a-different-user', roles: ['vendor'] }));
    expect(res.status).toBe(404);
  });

  it('422s a non-uuid :id param', async () => {
    const res = await request(app)
      .patch('/api/v1/notifications/not-a-uuid/read')
      .set('Authorization', bearerFor({ sub: USER_A, roles: ['vendor'] }));
    expect(res.status).toBe(422);
  });
});

describe('PATCH /api/v1/notifications/read-all', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).patch('/api/v1/notifications/read-all');
    expect(res.status).toBe(401);
  });

  it('marks all of the caller\'s own notifications read, scoped only to the caller', async () => {
    prismaMock.notification.updateMany.mockResolvedValue({ count: 3 });
    const res = await request(app)
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', bearerFor({ sub: USER_A, roles: ['vendor'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
      where: { recipientUserId: USER_A, isRead: false },
      data: expect.objectContaining({ isRead: true }),
    });
  });
});
