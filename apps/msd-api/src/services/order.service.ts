import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma, type OrderStatus, type OrderType } from '../generated/prisma-client';
import { getVendorByOwnerUserId } from './vendor.service';
import { VISIBLE_DEAL_WHERE, VISIBLE_THERAPIST_WHERE } from './catalog.service';
import type { OrderContactDetailsSchema } from '../schemas/order.schema';

type OrderContactDetails = z.infer<typeof OrderContactDetailsSchema>;

const ORDER_INCLUDE = {
  items: true,
  // Minimal, non-sensitive customer summary — only what a vendor/admin actually needs for
  // fulfilment (name + a contact channel). Never session/KYC/audit data.
  customer: { select: { id: true, name: true, phone: true, email: true } },
  vendor: { select: { id: true, businessName: true } },
  branch: { select: { id: true, name: true, address: true, city: true } },
  // Payment status only — never providerOrderId/providerPaymentId/signatureVerified, which
  // stay internal (see payment.service.ts). A customer/vendor/admin only ever needs to know
  // whether/why a payment attempt succeeded, not the gateway's own reference ids.
  payments: {
    select: { id: true, status: true, provider: true, amount: true, currency: true, failureReason: true, createdAt: true },
    orderBy: { createdAt: 'desc' as const },
  },
} as const;

/**
 * Admin/vendor/customer order UI label ("Deal Order" / "Product Order" / "Therapist Order" /
 * "Mixed Order") — computed from the composition of an order's own items rather than stored on
 * Order itself (Order.type stays the existing PRODUCT|SERVICE split, used for nothing beyond that
 * broad category). A line is a Deal purchase if `dealId` is set, a Therapist purchase if
 * `therapistId` is set (mutually exclusive per OrderItem's own "exactly one of dealId/therapistId
 * for a SERVICE item" doc comment), or a Product purchase if neither is set.
 */
export function describeOrderComposition(
  items: { dealId: string | null; therapistId: string | null }[],
): 'DEAL' | 'PRODUCT' | 'THERAPIST' | 'MIXED' {
  const kinds = new Set(items.map((item) => (item.therapistId ? 'THERAPIST' : item.dealId ? 'DEAL' : 'PRODUCT')));
  return kinds.size === 1 ? ([...kinds][0] as 'DEAL' | 'PRODUCT' | 'THERAPIST') : 'MIXED';
}

// ─── Customer: Cart → Order (Deal / Product / Therapist unified) ─────────────

/**
 * ONE checkout → ONE Order, whatever mix of Deal/Product/Therapist lines the cart holds (see
 * CartItem's own "three shapes" schema doc comment) — there is no separate Booking flow, and
 * never more than one Order per checkout. Multi-vendor: a cart may hold lines from any number of
 * vendors/branches — this creates one Order (one checkout, one payment) with per-line vendor/
 * branch on each OrderItem (see OrderItem's schema doc comment). `vendorId`/`branchId`/
 * `vendorNameSnapshot`/`branchNameSnapshot` on the Order itself are the "primary vendor" — the
 * first item's vendor, kept only so every existing single-vendor-order display (order-detail
 * header, invoice header, admin list) keeps working unchanged; for a cart that happens to hold
 * only one vendor (still the common case) this is byte-identical to every item's own vendor.
 */
export async function createOrderFromCart(customerId: string, contactDetails: OrderContactDetails = {}) {
  return prisma.$transaction(async (tx) => {
    let cart = await tx.cart.findUnique({ where: { customerId }, include: { items: true } });
    if (!cart) {
      throw new ApiError('VALIDATION_ERROR', 'Your cart is empty');
    }

    // Idempotent reuse — see Cart.pendingOrderId's schema doc comment. A repeat checkout call
    // (double-click, page refresh, browser back/forward) for a cart whose Order is still in
    // flight returns that same Order instead of creating a duplicate one.
    if (cart.pendingOrderId) {
      const pending = await tx.order.findUnique({ where: { id: cart.pendingOrderId }, include: ORDER_INCLUDE });
      if (pending && pending.status === 'PENDING_PAYMENT') {
        return pending;
      }
      // Stale reference (that Order was since cancelled, or is otherwise gone) — clear it and
      // fall through to create a fresh Order from the cart's still-intact items.
      await tx.cart.update({ where: { id: cart.id }, data: { pendingOrderId: null } });
      cart = { ...cart, pendingOrderId: null };
    }

    if (cart.items.length === 0) {
      throw new ApiError('VALIDATION_ERROR', 'Your cart is empty');
    }

    let subtotal = new Prisma.Decimal(0);
    const itemsData: Prisma.OrderItemCreateWithoutOrderInput[] = [];
    // First item's vendor/branch — see doc comment above.
    let primaryVendor: { id: string; businessName: string | null } | null = null;
    let primaryBranch: { id: string; name: string } | null = null;

    for (const item of cart.items) {
      if (item.therapistId) {
        // Therapist line — entirely independent of any Deal (see Therapist's own schema doc
        // comment). Re-validated against the SAME visibility rule the public catalogue uses.
        const therapist = await tx.therapist.findFirst({
          where: { id: item.therapistId, ...VISIBLE_THERAPIST_WHERE },
          include: { vendor: true, branch: true },
        });
        const pkg = item.therapistPackageId
          ? await tx.therapistPackage.findUnique({ where: { id: item.therapistPackageId } })
          : null;
        if (!therapist || !pkg || pkg.therapistId !== therapist.id || !pkg.isActive) {
          throw new ApiError('CONFLICT', 'One or more items in your cart are no longer available — please review your cart');
        }
        const unitPrice = new Prisma.Decimal(pkg.sellingPrice);
        const lineTotal = unitPrice.mul(item.quantity);
        subtotal = subtotal.add(lineTotal);
        if (!primaryVendor) {
          primaryVendor = therapist.vendor;
          primaryBranch = therapist.branch;
        }
        itemsData.push({
          therapist: { connect: { id: therapist.id } },
          therapistPackage: { connect: { id: pkg.id } },
          vendor: { connect: { id: therapist.vendorId } },
          branch: { connect: { id: therapist.branchId } },
          itemName: `${therapist.therapistType} — ${therapist.personName}`,
          itemType: 'SERVICE',
          vendorNameSnapshot: therapist.vendor.businessName ?? 'Vendor',
          branchNameSnapshot: therapist.branch.name,
          unitPrice,
          quantity: item.quantity,
          lineTotal,
          durationMinutes: pkg.durationMinutes,
        });
        continue;
      }

      // Deal line — either a Product deal (no dealPackageId) or a Service-Deal (dealPackageId
      // set). Re-validated against the SAME visibility rule the public catalogue uses — a deal
      // that's gone inactive/unapproved/vendor-suspended since it was added can't be checked out.
      const deal = await tx.deal.findFirst({
        where: { id: item.dealId!, ...VISIBLE_DEAL_WHERE },
        include: { product: { select: { name: true } }, vendor: true, branch: true },
      });
      if (!deal) {
        throw new ApiError('CONFLICT', 'One or more items in your cart are no longer available — please review your cart');
      }

      if (!primaryVendor) {
        primaryVendor = deal.vendor;
        primaryBranch = deal.branch;
      }

      if (item.dealPackageId) {
        // Service-Deal line. Never trusts CartItem.unitPrice — the package's own live
        // sellingPrice is authoritative.
        if (deal.productId) {
          throw new ApiError('CONFLICT', 'One or more items in your cart are no longer available — please review your cart');
        }
        const pkg = await tx.dealPackage.findUnique({ where: { id: item.dealPackageId } });
        if (!pkg || pkg.dealId !== deal.id || !pkg.isActive) {
          throw new ApiError('CONFLICT', 'One or more items in your cart are no longer available — please review your cart');
        }
        const unitPrice = new Prisma.Decimal(pkg.sellingPrice);
        const lineTotal = unitPrice.mul(item.quantity);
        subtotal = subtotal.add(lineTotal);
        itemsData.push({
          deal: { connect: { id: deal.id } },
          dealPackage: { connect: { id: pkg.id } },
          vendor: { connect: { id: deal.vendorId } },
          branch: { connect: { id: deal.branchId } },
          itemName: deal.title,
          itemType: 'SERVICE',
          vendorNameSnapshot: deal.vendor.businessName ?? 'Vendor',
          branchNameSnapshot: deal.branch.name,
          unitPrice,
          quantity: item.quantity,
          lineTotal,
          durationMinutes: pkg.durationMinutes,
        });
      } else {
        // Product line.
        if (!deal.productId || !deal.product) {
          throw new ApiError('CONFLICT', 'One or more items in your cart are no longer available — please review your cart');
        }
        const unitPrice = new Prisma.Decimal(deal.salePrice);
        const lineTotal = unitPrice.mul(item.quantity);
        subtotal = subtotal.add(lineTotal);
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
    }

    // Order.type stays the existing broad PRODUCT|SERVICE split (unchanged shape) — an order
    // with any Deal/Therapist line is SERVICE; the finer Deal/Product/Therapist/Mixed label for
    // display is `describeOrderComposition`, computed from `items[]`, never stored.
    const type: OrderType = itemsData.every((i) => i.itemType === 'PRODUCT') ? 'PRODUCT' : 'SERVICE';

    const order = await tx.order.create({
      data: {
        customerId,
        vendorId: primaryVendor!.id,
        branchId: primaryBranch!.id,
        type,
        vendorNameSnapshot: primaryVendor!.businessName ?? 'Vendor',
        branchNameSnapshot: primaryBranch!.name,
        subtotal,
        total: subtotal,
        items: { create: itemsData },
        ...contactDetails,
      },
      include: ORDER_INCLUDE,
    });

    // Cart items are deliberately NOT deleted here — only once payment for this Order actually
    // succeeds (see `finalizeCartForOrder` in payment.service.ts, called from every payment-
    // success path). Linking the cart to this Order is also what makes a repeat checkout call
    // idempotent — see the `pendingOrderId` reuse check at the top of this function.
    await tx.cart.update({ where: { id: cart.id }, data: { pendingOrderId: order.id } });

    return order;
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

/** A different customer's order 404s (not 403) — never confirms existence, same rule as Cart. */
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
  return prisma.order.update({
    where: { id },
    data: { status: 'CANCELLED', cancellationReason: reason ?? null },
    include: ORDER_INCLUDE,
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
 * Sibling helper reused by `payment.service.ts` — finalizes a cart-linked order's `CartItem` rows
 * now that payment has actually succeeded (see `Cart.pendingOrderId`'s schema doc comment for why
 * this doesn't happen eagerly at Order creation). No-op once the cart has already moved on (its
 * `pendingOrderId` no longer points at this order — nothing left to finalize, safe to call more
 * than once).
 */
export async function finalizeCartForOrder(tx: Prisma.TransactionClient, orderId: string) {
  const cart = await tx.cart.findUnique({ where: { pendingOrderId: orderId } });
  if (!cart) return;
  await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
  await tx.cart.update({ where: { id: cart.id }, data: { pendingOrderId: null } });
}

/**
 * Admin (no linked Vendor profile) may drive the full ADMIN_ALLOWED_TRANSITIONS matrix on any
 * order. A vendor caller is force-scoped to orders it has at least one line item in (404 for an
 * order it isn't part of at all — never confirms existence) and restricted to
 * VENDOR_ALLOWED_TRANSITIONS. Order.status is order-wide, not per-item, so a vendor caller may
 * only change status on an order that is entirely its own (single vendor) — a multi-vendor order
 * can only have its status changed by admin, since one vendor completing/cancelling would
 * otherwise silently affect every other vendor's items in the same order too.
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

  return prisma.order.update({
    where: { id },
    data: { status, cancellationReason: status === 'CANCELLED' ? (reason ?? order.cancellationReason) : order.cancellationReason },
    include: ORDER_INCLUDE,
  });
}
