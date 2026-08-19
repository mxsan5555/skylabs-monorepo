import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma, type OrderStatus } from '../generated/prisma-client';
import { getVendorByOwnerUserId } from './vendor.service';
import { VISIBLE_DEAL_WHERE } from './catalog.service';
import type { OrderContactDetailsSchema } from '../schemas/order.schema';

type OrderContactDetails = z.infer<typeof OrderContactDetailsSchema>;

const ORDER_INCLUDE = {
  items: true,
  // Minimal, non-sensitive customer summary — only what a vendor/admin actually needs for
  // fulfilment (name + a contact channel). Never session/KYC/audit data.
  customer: { select: { id: true, name: true, phone: true, email: true } },
  vendor: { select: { id: true, businessName: true } },
  branch: { select: { id: true, name: true, address: true, city: true } },
  booking: { select: { id: true, bookingDate: true, timeSlot: true, status: true } },
  // Payment status only — never providerOrderId/providerPaymentId/signatureVerified, which
  // stay internal (see payment.service.ts). A customer/vendor/admin only ever needs to know
  // whether/why a payment attempt succeeded, not the gateway's own reference ids.
  payments: {
    select: { id: true, status: true, provider: true, amount: true, currency: true, failureReason: true, createdAt: true },
    orderBy: { createdAt: 'desc' as const },
  },
} as const;

// ─── Customer: Cart → Order (product) ────────────────────────────────────────

/**
 * Multi-vendor: a cart may hold product deals from any number of vendors/branches — this
 * creates ONE Order (one checkout, one payment) with per-line vendor/branch on each OrderItem
 * (see OrderItem's schema doc comment). `vendorId`/`branchId`/`vendorNameSnapshot`/
 * `branchNameSnapshot` on the Order itself are the "primary vendor" — the first item's vendor,
 * kept only so every existing single-vendor-order display (order-detail header, invoice header,
 * admin list) keeps working unchanged; for a cart that happens to hold only one vendor (still
 * the common case) this is byte-identical to every item's own vendor, so nothing changes there.
 */
export async function createOrderFromCart(customerId: string, contactDetails: OrderContactDetails = {}) {
  return prisma.$transaction(async (tx) => {
    const cart = await tx.cart.findUnique({ where: { customerId }, include: { items: true } });
    if (!cart || cart.items.length === 0) {
      throw new ApiError('VALIDATION_ERROR', 'Your cart is empty');
    }

    let subtotal = new Prisma.Decimal(0);
    const itemsData: Prisma.OrderItemCreateWithoutOrderInput[] = [];
    // First item's vendor/branch — see doc comment above.
    let primaryVendor: { id: string; businessName: string | null } | null = null;
    let primaryBranch: { id: string; name: string } | null = null;

    for (const item of cart.items) {
      // Re-validate against the SAME visibility rule the public catalogue uses — a deal that's
      // gone inactive/unapproved/vendor-suspended since it was added can't be checked out.
      // Server-side price, never CartItem.unitPrice (which is only provisional — see its doc
      // comment in schema.prisma). Vendor/branch come from the deal's own relations, not the
      // cart — VISIBLE_DEAL_WHERE already requires an ACTIVE vendor + active branch.
      const deal = await tx.deal.findFirst({
        where: { id: item.dealId, ...VISIBLE_DEAL_WHERE },
        include: { product: { select: { name: true } }, vendor: true, branch: true },
      });
      if (!deal || !deal.productId || !deal.product) {
        throw new ApiError('CONFLICT', 'One or more items in your cart are no longer available — please review your cart');
      }
      const unitPrice = new Prisma.Decimal(deal.salePrice);
      const lineTotal = unitPrice.mul(item.quantity);
      subtotal = subtotal.add(lineTotal);

      if (!primaryVendor) {
        primaryVendor = deal.vendor;
        primaryBranch = deal.branch;
      }

      itemsData.push({
        deal: { connect: { id: deal.id } },
        vendor: { connect: { id: deal.vendorId } },
        branch: { connect: { id: deal.branchId } },
        itemName: deal.product.name,
        itemType: 'PRODUCT',
        vendorNameSnapshot: deal.vendor.businessName ?? 'Vendor',
        branchNameSnapshot: deal.branch.name,
        unitPrice,
        quantity: item.quantity,
        lineTotal,
      });
    }

    const order = await tx.order.create({
      data: {
        customerId,
        vendorId: primaryVendor!.id,
        branchId: primaryBranch!.id,
        type: 'PRODUCT',
        vendorNameSnapshot: primaryVendor!.businessName ?? 'Vendor',
        branchNameSnapshot: primaryBranch!.name,
        subtotal,
        total: subtotal,
        items: { create: itemsData },
        ...contactDetails,
      },
      include: ORDER_INCLUDE,
    });

    // Cart cleanup only happens here, inside the same transaction as the successful Order — a
    // thrown error above rolls everything back and the cart is untouched.
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

    return order;
  });
}

// ─── Customer: Booking → Order (service) ─────────────────────────────────────

export async function createOrderFromBooking(customerId: string, bookingId: string, contactDetails: OrderContactDetails = {}) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: {
        deal: { include: { service: { select: { name: true } } } },
        vendor: true,
        branch: true,
        therapist: { select: { therapistType: true, personName: true } },
      },
    });
    if (!booking || booking.customerId !== customerId) throw new ApiError('NOT_FOUND', 'Booking not found');
    if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
      throw new ApiError('CONFLICT', `Cannot create an order from a booking with status ${booking.status}`);
    }
    // App-layer pre-check for a clean 409 — Order.bookingId's DB-level @unique is the hard guarantee.
    const existingOrder = await tx.order.findUnique({ where: { bookingId } });
    if (existingOrder) throw new ApiError('CONFLICT', 'This booking already has an order');

    // Never re-reads Deal — copies the already-immutable Booking snapshot from Phase 7.
    const priceSnapshot = new Prisma.Decimal(booking.priceSnapshot);
    const lineTotal = priceSnapshot.mul(booking.quantity);
    // booking.deal is null for a Therapist booked directly (no Deal involved at all) — see
    // Booking's own "exactly one of dealId/therapistId" doc comment.
    const serviceName = booking.deal ? (booking.deal.service?.name ?? booking.deal.title) : undefined;
    // Surfaces WHICH therapist this booking is for on the order/invoice, without adding a new
    // column — OrderItem's itemName is already a free-text label, and the authoritative
    // therapistId/therapistPackageId/priceSnapshot live on Booking itself (order.booking.* is
    // already reachable from any Order this item belongs to).
    const itemName = booking.therapist
      ? serviceName
        ? `${serviceName} — ${booking.therapist.personName}`
        : `${booking.therapist.therapistType} — ${booking.therapist.personName}`
      : serviceName!;

    return tx.order.create({
      data: {
        customerId,
        vendorId: booking.vendorId,
        branchId: booking.branchId,
        type: 'SERVICE',
        bookingId: booking.id,
        vendorNameSnapshot: booking.vendor.businessName ?? 'Vendor',
        branchNameSnapshot: booking.branch.name,
        subtotal: lineTotal,
        total: lineTotal,
        ...contactDetails,
        items: {
          create: [
            {
              ...(booking.dealId ? { deal: { connect: { id: booking.dealId } } } : {}),
              ...(booking.dealPackageId ? { dealPackage: { connect: { id: booking.dealPackageId } } } : {}),
              ...(booking.therapistId ? { therapist: { connect: { id: booking.therapistId } } } : {}),
              ...(booking.therapistPackageId
                ? { therapistPackage: { connect: { id: booking.therapistPackageId } } }
                : {}),
              vendor: { connect: { id: booking.vendorId } },
              branch: { connect: { id: booking.branchId } },
              itemName,
              itemType: 'SERVICE',
              vendorNameSnapshot: booking.vendor.businessName ?? 'Vendor',
              branchNameSnapshot: booking.branch.name,
              unitPrice: priceSnapshot,
              quantity: booking.quantity,
              lineTotal,
              durationMinutes: booking.durationMinutesSnapshot,
            },
          ],
        },
      },
      include: ORDER_INCLUDE,
    });
  });
}

// ─── Customer self-service ────────────────────────────────────────────────────

export async function listMyOrders(customerId: string, opts: { page: number; pageSize: number; status?: OrderStatus }) {
  const where = { customerId, ...(opts.status ? { status: opts.status } : {}) };
  const [items, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize, include: ORDER_INCLUDE }),
    prisma.order.count({ where }),
  ]);
  return { items, total };
}

/** A different customer's order 404s (not 403) — never confirms existence, same rule as Cart/Booking. */
export async function getMyOrderOrThrow(customerId: string, id: string) {
  const order = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
  if (!order || order.customerId !== customerId) throw new ApiError('NOT_FOUND', 'Order not found');
  return order;
}

export async function cancelMyOrder(customerId: string, id: string, reason?: string) {
  const order = await getMyOrderOrThrow(customerId, id);
  if (order.status !== 'PENDING_PAYMENT' && order.status !== 'CONFIRMED') {
    throw new ApiError('CONFLICT', `Cannot cancel an order with status ${order.status}`);
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id },
      data: { status: 'CANCELLED', cancellationReason: reason ?? null },
      include: ORDER_INCLUDE,
    });
    await cascadeBookingStatus(tx, updated, 'CANCELLED');
    return updated;
  });
}

// ─── Admin / vendor-scoped ────────────────────────────────────────────────────

interface OrderListFilters {
  page: number;
  pageSize: number;
  status?: OrderStatus;
  vendorId?: string;
  branchId?: string;
  customerId?: string;
  paymentStatus?: 'CREATED' | 'PAID' | 'FAILED' | 'CANCELLED';
  createdFrom?: string;
  createdTo?: string;
  search?: string;
}

/** For a vendor caller, an Order's `items[]` must never include another vendor's line items —
 *  a multi-vendor order is only ever fully visible to the customer who placed it and to
 *  admin/SuperAdmin. Applied to every order returned to a vendor caller in this file. */
function scopeOrderItemsToVendor<T extends { items: { vendorId: string }[] }>(order: T, vendorId: string): T {
  return { ...order, items: order.items.filter((item) => item.vendorId === vendorId) };
}

/**
 * One endpoint serves both admin (cross-tenant) and vendor (own-orders-only) callers. If the
 * caller owns a Vendor profile, results are ALWAYS force-scoped to that vendorId — never the
 * optional `vendorId` filter, which only an admin (no Vendor profile) can use to drill in.
 * Reuses vendor.service.ts's existing getVendorByOwnerUserId — not reimplemented.
 *
 * Multi-vendor: matching and filtering is done via `OrderItem.vendorId`/`branchId` (an order
 * "belongs" to a vendor if any of its items do), never the Order-level vendorId/branchId, which
 * is only the "primary vendor" for display (see Order's schema doc comment). A vendor caller's
 * results additionally have every returned order's `items[]` filtered down to their own items
 * only — never another vendor's line items/pricing, even for an order they're scoped to see.
 */
export async function listOrders(callerUserId: string, opts: OrderListFilters) {
  const vendor = await getVendorByOwnerUserId(callerUserId);
  const scopedVendorId = vendor ? vendor.id : opts.vendorId;
  const where = {
    ...(scopedVendorId ? { items: { some: { vendorId: scopedVendorId } } } : {}),
    ...(opts.branchId ? { items: { some: { branchId: opts.branchId } } } : {}),
    ...(opts.customerId ? { customerId: opts.customerId } : {}),
    ...(opts.status ? { status: opts.status } : {}),
    // Order has no single "payment status" column of its own (Order 1 -> Payment[]) — this
    // matches "has at least one payment attempt in this state", not "the current/latest one".
    ...(opts.paymentStatus ? { payments: { some: { status: opts.paymentStatus } } } : {}),
    ...(opts.createdFrom || opts.createdTo
      ? {
          createdAt: {
            ...(opts.createdFrom ? { gte: new Date(opts.createdFrom) } : {}),
            ...(opts.createdTo ? { lte: new Date(opts.createdTo) } : {}),
          },
        }
      : {}),
    ...(opts.search
      ? {
          OR: [
            { vendorNameSnapshot: { contains: opts.search, mode: 'insensitive' as const } },
            { branchNameSnapshot: { contains: opts.search, mode: 'insensitive' as const } },
            { customer: { is: { name: { contains: opts.search, mode: 'insensitive' as const } } } },
            { items: { some: { itemName: { contains: opts.search, mode: 'insensitive' as const } } } },
            { items: { some: { vendorNameSnapshot: { contains: opts.search, mode: 'insensitive' as const } } } },
          ],
        }
      : {}),
  };
  const [rawItems, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize, include: ORDER_INCLUDE }),
    prisma.order.count({ where }),
  ]);
  const items = vendor ? rawItems.map((order) => scopeOrderItemsToVendor(order, vendor.id)) : rawItems;
  return { items, total };
}

/** Same vendor-scoping rule as listOrders — a vendor requesting an order none of its own deals
 *  are part of 404s (never confirms existence), and the returned order's items[] are filtered
 *  to the caller's own vendor only. */
export async function getOrderOrThrow(callerUserId: string, id: string) {
  const vendor = await getVendorByOwnerUserId(callerUserId);
  const order = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
  if (!order) throw new ApiError('NOT_FOUND', 'Order not found');
  if (!vendor) return order;
  const scoped = scopeOrderItemsToVendor(order, vendor.id);
  if (scoped.items.length === 0) throw new ApiError('NOT_FOUND', 'Order not found');
  return scoped;
}

const ADMIN_ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** Narrower than admin's: a vendor can never touch an order that hasn't been paid yet — the
 *  ONLY path from PENDING_PAYMENT to CONFIRMED is verified payment (payment.service.ts), never
 *  a manual status change — so "payment failure must never accidentally confirm/complete an
 *  order" holds structurally here, not just by convention. */
const VENDOR_ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: [],
  CONFIRMED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

/**
 * Keeps a SERVICE order's linked Booking in sync with the Order's own lifecycle. Booking stays
 * its own row/lifecycle (never recreated or merged into Order) — this only mirrors the Order's
 * transition so a paid/cancelled/completed order doesn't leave its Booking sitting at PENDING
 * forever (which would otherwise keep counting toward the customer's "pending cart" — see
 * `listMyBookings`'s `status=PENDING` filter, used by the header cart badge and cart page).
 * `CONFIRMED` is called from `payment.service.ts` the moment an Order is actually paid/COD-
 * confirmed — this is the fix for "purchased item still shows in cart after checkout". No-op if
 * the Booking is already terminal (COMPLETED/CANCELLED — never overwritten) or already in the
 * target state (idempotent, safe to call from a duplicate payment-verification callback).
 * Exported for `payment.service.ts` to reuse — never duplicated there.
 */
export async function cascadeBookingStatus(
  tx: Prisma.TransactionClient,
  order: { type: string; bookingId: string | null },
  status: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED',
) {
  if (order.type !== 'SERVICE' || !order.bookingId) return;
  const booking = await tx.booking.findUnique({ where: { id: order.bookingId } });
  if (!booking || booking.status === 'COMPLETED' || booking.status === 'CANCELLED' || booking.status === status) return;
  await tx.booking.update({ where: { id: order.bookingId }, data: { status } });
}

/**
 * Admin (no linked Vendor profile) may drive the full ADMIN_ALLOWED_TRANSITIONS matrix on any
 * order. A vendor caller is force-scoped to orders it has at least one line item in (404 for an
 * order it isn't part of at all — never confirms existence) and restricted to
 * VENDOR_ALLOWED_TRANSITIONS. Order.status is order-wide, not per-item, so a vendor caller may
 * only change status on an order that is entirely its own (single vendor) — a multi-vendor order
 * can only have its status changed by admin, since one vendor completing/cancelling would
 * otherwise silently affect every other vendor's items in the same order too. Cascades to the
 * linked Booking on a terminal transition (see cascadeBookingStatus) — all inside one transaction.
 */
export async function setOrderStatus(callerUserId: string, id: string, status: OrderStatus, reason?: string) {
  const vendor = await getVendorByOwnerUserId(callerUserId);
  const order = await prisma.order.findUnique({ where: { id }, include: { items: { select: { vendorId: true } } } });
  if (!order) throw new ApiError('NOT_FOUND', 'Order not found');

  if (vendor) {
    const distinctVendorIds = new Set(order.items.map((item) => item.vendorId));
    if (!distinctVendorIds.has(vendor.id)) throw new ApiError('NOT_FOUND', 'Order not found');
    if (distinctVendorIds.size > 1) {
      throw new ApiError('FORBIDDEN', 'This order includes other vendors’ items — only an admin can change its status');
    }
  }

  const allowed = vendor ? VENDOR_ALLOWED_TRANSITIONS : ADMIN_ALLOWED_TRANSITIONS;
  if (!allowed[order.status].includes(status)) {
    throw new ApiError('CONFLICT', `Cannot change status from ${order.status} to ${status}`);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id },
      data: { status, cancellationReason: status === 'CANCELLED' ? (reason ?? order.cancellationReason) : order.cancellationReason },
      include: ORDER_INCLUDE,
    });
    if (status === 'COMPLETED' || status === 'CANCELLED') {
      await cascadeBookingStatus(tx, updated, status);
    }
    return updated;
  });
}
