import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma, type NotificationType } from '../generated/prisma-client';

/**
 * A recipient is always a real `User` row (see Notification's own schema doc comment) — a Vendor
 * notification resolves `Vendor.ownerUserId`, a Superadmin notification resolves every User whose
 * Role has `isSuperAdmin`. Every creation function here takes a `tx: Prisma.TransactionClient`,
 * never the bare `prisma` client — notification rows must always be created atomically with the
 * business event that triggered them (Deal creation, Order confirmation), never as an
 * afterthought bolted onto a route handler. A notification failure must also never break that
 * business event, so `notifyVendorOwner`'s "no owner yet" case is a no-op, not a thrown error.
 */

interface NotificationInput {
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}

async function createNotificationRow(
  tx: Prisma.TransactionClient,
  recipientUserId: string,
  recipientType: 'SUPERADMIN' | 'VENDOR',
  input: NotificationInput,
) {
  await tx.notification.create({
    data: {
      recipientUserId,
      recipientType,
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
    },
  });
}

/** One row per User with an `isSuperAdmin`-flagged, active Role — mirrors
 *  `permission-resolver.service.ts`'s own "a role flag, never a role-key string compare" rule. */
export async function notifySuperAdmins(tx: Prisma.TransactionClient, input: NotificationInput) {
  const superAdmins = await tx.user.findMany({
    where: { roles: { some: { role: { isSuperAdmin: true, isActive: true } } } },
    select: { id: true },
  });
  for (const admin of superAdmins) {
    await createNotificationRow(tx, admin.id, 'SUPERADMIN', input);
  }
}

/** No-ops (does not throw) when the vendor has no `ownerUserId` yet (an admin-created, not-yet-
 *  claimed vendor) — a notification failure must never break the deal/order flow that triggered it. */
export async function notifyVendorOwner(tx: Prisma.TransactionClient, vendorId: string, input: NotificationInput) {
  const vendor = await tx.vendor.findUnique({ where: { id: vendorId }, select: { ownerUserId: true } });
  if (!vendor?.ownerUserId) {
    console.warn({ context: 'notifyVendorOwner: vendor has no owner yet, skipping', vendorId });
    return;
  }
  await createNotificationRow(tx, vendor.ownerUserId, 'VENDOR', input);
}

/** Display-only label derived from the Order's own uuid `id` — no `orderNumber` column exists on
 *  Order (see the notification-system plan's own note on this), so this is never persisted and
 *  never shown anywhere outside notification text. */
export function shortOrderNumber(orderId: string): string {
  return `ORD-${orderId.slice(-8).toUpperCase()}`;
}

/**
 * The single reusable hook called from every place in `payment.service.ts` where an Order
 * transitions to CONFIRMED (see that file's own call sites, all already guarded against
 * double-processing by pre-existing idempotency checks — this function is only ever reached once
 * per real confirmation). One notification per DISTINCT vendor among the order's own OrderItems
 * (never the Order's own "primary vendor" column, which only reflects the first line item — see
 * OrderItem's schema doc comment on why each item carries its own vendorId), plus one Superadmin
 * notification for the order as a whole.
 */
export async function notifyOrderConfirmed(tx: Prisma.TransactionClient, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId }, select: { vendorId: true } });
  const vendorIds = [...new Set(items.map((item) => item.vendorId))];
  const orderNumber = shortOrderNumber(orderId);

  for (const vendorId of vendorIds) {
    await notifyVendorOwner(tx, vendorId, {
      type: 'ORDER_RECEIVED',
      title: 'New Order Received',
      message: `You have received a new order #${orderNumber}.`,
      entityType: 'ORDER',
      entityId: orderId,
    });
  }

  await notifySuperAdmins(tx, {
    type: 'ORDER_RECEIVED',
    title: 'New Order Received',
    message: `New order #${orderNumber} has been placed.`,
    entityType: 'ORDER',
    entityId: orderId,
  });
}

export async function listNotificationsForUser(userId: string, opts: { page: number; pageSize: number }) {
  const where = { recipientUserId: userId };
  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { ...where, isRead: false } }),
  ]);
  return { items, total, unreadCount };
}

/** Ownership-checked — the `where` filters by `recipientUserId` in the same query as the `id`
 *  lookup, so an attempt to mark another user's notification read affects 0 rows and 404s, never
 *  confirming that a notification with that id exists for someone else (same discipline as
 *  `getMyOrderOrThrow`'s "404 not 403" rule). */
export async function markNotificationRead(userId: string, id: string) {
  const result = await prisma.notification.updateMany({
    where: { id, recipientUserId: userId },
    data: { isRead: true, readAt: new Date() },
  });
  if (result.count === 0) throw new ApiError('NOT_FOUND', 'Notification not found');
}

export async function markAllNotificationsRead(userId: string) {
  await prisma.notification.updateMany({
    where: { recipientUserId: userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}
