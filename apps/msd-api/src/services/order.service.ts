import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma, type OrderStatus } from '../generated/prisma-client';
import { getVendorByOwnerUserId } from './vendor.service';
import { VISIBLE_DEAL_WHERE } from './catalog.service';

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

export async function createOrderFromCart(customerId: string) {
  return prisma.$transaction(async (tx) => {
    const cart = await tx.cart.findUnique({ where: { customerId }, include: { items: true } });
    if (!cart || cart.items.length === 0 || !cart.vendorId || !cart.branchId) {
      throw new ApiError('VALIDATION_ERROR', 'Your cart is empty');
    }

    const vendor = await tx.vendor.findUnique({ where: { id: cart.vendorId } });
    const branch = await tx.branch.findUnique({ where: { id: cart.branchId } });
    if (!vendor || !branch) throw new ApiError('NOT_FOUND', 'Vendor or branch no longer exists');

    let subtotal = new Prisma.Decimal(0);
    const itemsData: Prisma.OrderItemCreateWithoutOrderInput[] = [];

    for (const item of cart.items) {
      // Re-validate against the SAME visibility rule the public catalogue uses — a deal that's
      // gone inactive/unapproved/vendor-suspended since it was added can't be checked out.
      // Server-side price, never CartItem.unitPrice (which is only provisional — see its doc
      // comment in schema.prisma).
      const deal = await tx.deal.findFirst({
        where: { id: item.dealId, ...VISIBLE_DEAL_WHERE },
        include: { product: { select: { name: true } } },
      });
      if (!deal || !deal.productId || !deal.product) {
        throw new ApiError('CONFLICT', 'One or more items in your cart are no longer available — please review your cart');
      }
      const unitPrice = new Prisma.Decimal(deal.salePrice);
      const lineTotal = unitPrice.mul(item.quantity);
      subtotal = subtotal.add(lineTotal);
      itemsData.push({
        deal: { connect: { id: deal.id } },
        itemName: deal.product.name,
        itemType: 'PRODUCT',
        unitPrice,
        quantity: item.quantity,
        lineTotal,
      });
    }

    const order = await tx.order.create({
      data: {
        customerId,
        vendorId: vendor.id,
        branchId: branch.id,
        type: 'PRODUCT',
        vendorNameSnapshot: vendor.businessName ?? 'Vendor',
        branchNameSnapshot: branch.name,
        subtotal,
        total: subtotal,
        items: { create: itemsData },
      },
      include: ORDER_INCLUDE,
    });

    // Cart cleanup only happens here, inside the same transaction as the successful Order — a
    // thrown error above rolls everything back and the cart is untouched.
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    await tx.cart.update({ where: { id: cart.id }, data: { vendorId: null, branchId: null } });

    return order;
  });
}

// ─── Customer: Booking → Order (service) ─────────────────────────────────────

export async function createOrderFromBooking(customerId: string, bookingId: string) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { deal: { include: { service: { select: { name: true } } } }, vendor: true, branch: true },
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
        items: {
          create: [
            {
              deal: { connect: { id: booking.dealId } },
              itemName: booking.deal.service?.name ?? booking.deal.title,
              itemType: 'SERVICE',
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
  paymentStatus?: 'CREATED' | 'PAID' | 'FAILED' | 'CANCELLED';
  createdFrom?: string;
  createdTo?: string;
  search?: string;
}

/**
 * One endpoint serves both admin (cross-tenant) and vendor (own-orders-only) callers. If the
 * caller owns a Vendor profile, results are ALWAYS force-scoped to that vendorId — never the
 * optional `vendorId` filter, which only an admin (no Vendor profile) can use to drill in.
 * Reuses vendor.service.ts's existing getVendorByOwnerUserId — not reimplemented.
 */
export async function listOrders(callerUserId: string, opts: OrderListFilters) {
  const vendor = await getVendorByOwnerUserId(callerUserId);
  const scopedVendorId = vendor ? vendor.id : opts.vendorId;
  const where = {
    ...(scopedVendorId ? { vendorId: scopedVendorId } : {}),
    ...(opts.branchId ? { branchId: opts.branchId } : {}),
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
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize, include: ORDER_INCLUDE }),
    prisma.order.count({ where }),
  ]);
  return { items, total };
}

/** Same vendor-scoping rule as listOrders — a vendor requesting another vendor's order id 404s. */
export async function getOrderOrThrow(callerUserId: string, id: string) {
  const vendor = await getVendorByOwnerUserId(callerUserId);
  const order = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
  if (!order || (vendor && order.vendorId !== vendor.id)) throw new ApiError('NOT_FOUND', 'Order not found');
  return order;
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

/** Keeps a SERVICE order's linked Booking in sync when the Order reaches a terminal state.
 *  Booking stays its own row/lifecycle (never recreated or merged into Order) — this only
 *  mirrors the terminal transition so a cancelled/completed order doesn't leave its appointment
 *  sitting at PENDING/CONFIRMED forever. No-op if the Booking is already terminal or already in
 *  the target state. */
async function cascadeBookingStatus(
  tx: Prisma.TransactionClient,
  order: { type: string; bookingId: string | null },
  status: 'COMPLETED' | 'CANCELLED',
) {
  if (order.type !== 'SERVICE' || !order.bookingId) return;
  const booking = await tx.booking.findUnique({ where: { id: order.bookingId } });
  // Already terminal (COMPLETED/CANCELLED) — never overwritten, and covers the "already this
  // exact status" case too, since status here is always COMPLETED or CANCELLED itself.
  if (!booking || booking.status === 'COMPLETED' || booking.status === 'CANCELLED') return;
  await tx.booking.update({ where: { id: order.bookingId }, data: { status } });
}

/**
 * Admin (no linked Vendor profile) may drive the full ADMIN_ALLOWED_TRANSITIONS matrix on any
 * order. A vendor caller is force-scoped to its own orders (404 for another vendor's order —
 * never confirms existence, same rule as every other ownership check in this codebase) and
 * restricted to VENDOR_ALLOWED_TRANSITIONS. Cascades to the linked Booking on a terminal
 * transition (see cascadeBookingStatus) — all inside one transaction.
 */
export async function setOrderStatus(callerUserId: string, id: string, status: OrderStatus, reason?: string) {
  const vendor = await getVendorByOwnerUserId(callerUserId);
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order || (vendor && order.vendorId !== vendor.id)) throw new ApiError('NOT_FOUND', 'Order not found');

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
