import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { Prisma, type OrderStatus, type OrderType } from '../generated/prisma-client';
import { getVendorByOwnerUserId } from './vendor.service';
import { VISIBLE_DEAL_WHERE, VISIBLE_PRODUCT_WHERE, VISIBLE_THERAPIST_WHERE } from './catalog.service';
import type { OrderContactDetailsSchema } from '../schemas/order.schema';
import { env } from '../config/env';

type OrderContactDetails = z.infer<typeof OrderContactDetailsSchema>;

/** Base fields both the customer-facing and admin/vendor-facing entitlement selects need —
 *  factored out so neither duplicates the other's voucher-identity columns. Never the OTP hash
 *  (`CompletionOtpChallenge` is a wholly separate model, never selected/joined here at all). */
const ENTITLEMENT_BASE_SELECT = {
  id: true,
  voucherCode: true,
  fulfilmentKind: true,
  entitlementStatus: true,
} as const;

/**
 * Admin/vendor-facing entitlement columns for the Order Details page's "Service/Delivery/
 * Voucher" section — adds settlement status + carrier/tracking/delivery-evidence on top of the
 * shared base. Deliberately still narrow: no `grossAmount`/`commissionAmount`/`memberShareAmount`/
 * `payoutItemId` (payout internals belong to Member Settlements, not the order view) and, same
 * discipline as `CUSTOMER_ORDER_INCLUDE` below, never the OTP hash.
 */
const ADMIN_ENTITLEMENT_SELECT = {
  ...ENTITLEMENT_BASE_SELECT,
  settlementStatus: true,
  carrier: true,
  trackingNumber: true,
  shippedAt: true,
  deliveryEvidenceStorageKey: true,
  deliveryEvidenceNote: true,
} as const;

const ORDER_INCLUDE = {
  items: {
    include: {
      // Narrow, admin/vendor-facing entitlement view — see ADMIN_ENTITLEMENT_SELECT's own doc
      // comment. Additive: every existing admin/vendor caller of ORDER_INCLUDE (checkout,
      // listOrders, getOrderOrThrow, setOrderStatus) now also gets this on each item, unused
      // unless read.
      purchaseEntitlements: {
        orderBy: { sequenceNo: 'asc' as const },
        select: ADMIN_ENTITLEMENT_SELECT,
      },
    },
  },
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

const DEAL_IMAGE_ORDER_BY: Prisma.DealImageOrderByWithRelationInput[] = [
  { isPrimary: 'desc' },
  { sortOrder: 'asc' },
];
const PRODUCT_IMAGE_ORDER_BY: Prisma.ProductImageOrderByWithRelationInput[] = [
  { isPrimary: 'desc' },
  { sortOrder: 'asc' },
];

const THERAPIST_IMAGE_ORDER_BY: Prisma.TherapistImageOrderByWithRelationInput[] = [
  { isPrimary: 'desc' },
  { sortOrder: 'asc' },
];

const CUSTOMER_ORDER_INCLUDE = {
  ...ORDER_INCLUDE,
  items: {
    include: {
      deal: {
        select: {
          images: true,
          mediaImages: {
            orderBy: DEAL_IMAGE_ORDER_BY,
            select: { storageKey: true, isPrimary: true, sortOrder: true },
          },
        },
      },
      product: {
        select: {
          image: true,
          gallery: true,
          mediaImages: {
            orderBy: PRODUCT_IMAGE_ORDER_BY,
            select: { storageKey: true, isPrimary: true, sortOrder: true },
          },
        },
      },
      therapist: {
        select: {
          mediaImages: {
            orderBy: THERAPIST_IMAGE_ORDER_BY,
            select: { storageKey: true, isPrimary: true, sortOrder: true },
          },
        },
      },
      // Voucher/entitlement data for the owning customer only — reachable exclusively via
      // CUSTOMER_ORDER_INCLUDE (never ORDER_INCLUDE, which admin/vendor callers get), and this
      // whole include is itself only ever read for the row's own customerId (see
      // listMyOrders/getMyOrderOrThrow below). Deliberately a narrow `select`, never the raw
      // PurchaseEntitlement row: no OTP hash, no payout/bank internals, no other customer's data
      // (every entitlement here belongs to this same order's customer by construction) — just
      // enough for "see your voucher code + status, raise an issue against it", matching
      // apps/msd's `OrderItem['entitlements']` shape exactly.
      purchaseEntitlements: {
        orderBy: { sequenceNo: 'asc' as const },
        select: {
          ...ENTITLEMENT_BASE_SELECT,
          disputes: {
            orderBy: { createdAt: 'desc' as const },
            take: 1,
            select: { id: true, status: true, resolutionType: true },
          },
        },
      },
    },
  },
} as const;

type CustomerOrder = Prisma.OrderGetPayload<{ include: typeof CUSTOMER_ORDER_INCLUDE }>;

function firstLegacyImage(value: Prisma.JsonValue | null): string | null {
  if (!Array.isArray(value)) return null;
  const image = value.find((candidate) => typeof candidate === 'string');
  return typeof image === 'string' ? image : null;
}

function firstMediaImage(images: { storageKey: string; isPrimary: boolean }[]): string | null {
  return images.find((image) => image.isPrimary)?.storageKey ?? images[0]?.storageKey ?? null;
}

function addCustomerOrderItemImages(order: CustomerOrder) {
  return {
    ...order,
    items: order.items.map(({ deal, product, therapist, purchaseEntitlements = [], ...item }) => {
      let imageKey: string | null = null;

      if (deal) {
        imageKey = firstMediaImage(deal.mediaImages) ?? firstLegacyImage(deal.images);
      } else if (product) {
        imageKey =
          firstMediaImage(product.mediaImages) ??
          firstLegacyImage(product.gallery) ??
          product.image;
      }else if (therapist) {
        imageKey = firstMediaImage(therapist.mediaImages);
      }

      return {
        ...item,
        image: getPublicImageUrl(imageKey),
        // Flatten PurchaseEntitlement.disputes (narrowed to the latest one, see
        // CUSTOMER_ORDER_INCLUDE above) into a single `dispute` to match apps/msd's
        // `OrderItem['entitlements'][number]` shape exactly.
        entitlements: purchaseEntitlements.map(({ disputes, ...entitlement }) => ({
          ...entitlement,
          dispute: disputes[0] ?? null,
        })),
      };
    }),
  };
}

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
    // First item's vendor becomes Order.vendorId; first item that HAS a branch (a Product line
    // has none — see Product's own schema doc comment) becomes Order.branchId. Tracked
    // independently so a Product-first cart still picks up a real branch from a later Deal/
    // Therapist line, rather than getting stuck on "no branch" forever.
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
        if (!primaryVendor) primaryVendor = therapist.vendor;
        if (!primaryBranch) primaryBranch = therapist.branch;
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

      if (item.productId) {
        // Product line — entirely independent of any Deal (Product is a fully independent,
        // directly-purchasable catalog entity, see Product's own schema doc comment). Re-
        // validated against the SAME visibility rule the public catalogue/cart use. No branch —
        // Product has no branchId.
        const product = await tx.product.findFirst({
          where: { id: item.productId, ...VISIBLE_PRODUCT_WHERE },
          include: { vendor: true },
        });
        if (!product) {
          throw new ApiError('CONFLICT', 'One or more items in your cart are no longer available — please review your cart');
        }
        const unitPrice = new Prisma.Decimal(product.price);
        const lineTotal = unitPrice.mul(item.quantity);
        subtotal = subtotal.add(lineTotal);
        if (!primaryVendor) primaryVendor = product.vendor;
        itemsData.push({
          product: { connect: { id: product.id } },
          vendor: { connect: { id: product.vendorId } },
          itemName: product.name,
          itemType: 'PRODUCT',
          vendorNameSnapshot: product.vendor.businessName ?? 'Vendor',
          unitPrice,
          quantity: item.quantity,
          lineTotal,
        });
        continue;
      }

      // Deal line — always a Service-Deal now (Deal has no Product concept — see Deal's own
      // schema doc comment). Re-validated against the SAME visibility rule the public catalogue
      // uses — a deal that's gone inactive/unapproved/vendor-suspended since it was added can't
      // be checked out.
      const deal = await tx.deal.findFirst({
        where: { id: item.dealId!, ...VISIBLE_DEAL_WHERE },
        include: { vendor: true, branch: true },
      });
      if (!deal) {
        throw new ApiError('CONFLICT', 'One or more items in your cart are no longer available — please review your cart');
      }

      if (!primaryVendor) primaryVendor = deal.vendor;
      if (!primaryBranch) primaryBranch = deal.branch;

      // Never trusts CartItem.unitPrice — the package's own live sellingPrice is authoritative.
      const pkg = await tx.dealPackage.findUnique({ where: { id: item.dealPackageId! } });
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
    }

    // Order.type stays the existing broad PRODUCT|SERVICE split (unchanged shape) — an order
    // with any Deal/Therapist line is SERVICE; the finer Deal/Product/Therapist/Mixed label for
    // display is `describeOrderComposition`, computed from `items[]`, never stored.
    const type: OrderType = itemsData.every((i) => i.itemType === 'PRODUCT') ? 'PRODUCT' : 'SERVICE';

    const order = await tx.order.create({
      data: {
        customerId,
        vendorId: primaryVendor!.id,
        branchId: primaryBranch?.id ?? null,
        type,
        vendorNameSnapshot: primaryVendor!.businessName ?? 'Vendor',
        branchNameSnapshot: primaryBranch?.name ?? null,
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

//HELPER FUNCTION

function getPublicImageUrl(storageKey: string | null | undefined): string | null {
  if (!storageKey) return null;

  // Agar already full URL hai toh waisa hi return kar do
  if (storageKey.startsWith('http://') || storageKey.startsWith('https://')) {
    return storageKey;
  }

  // R2 storage key hai → public URL banao
  return `${env.r2PublicUrl}/${storageKey}`;
}
// ─── Customer self-service ────────────────────────────────────────────────────

export async function listMyOrders(customerId: string, opts: { page: number; pageSize: number; status?: OrderStatus }) {
  const where = { customerId, ...(opts.status ? { status: opts.status } : {}) };
  const [items, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize, include: CUSTOMER_ORDER_INCLUDE }),
    prisma.order.count({ where }),
  ]);
  return { items: items.map(addCustomerOrderItemImages), total };
}

/** A different customer's order 404s (not 403) — never confirms existence, same rule as Cart. */
export async function getMyOrderOrThrow(customerId: string, id: string) {
  const order = await prisma.order.findUnique({ where: { id }, include: CUSTOMER_ORDER_INCLUDE });
  if (!order || order.customerId !== customerId) throw new ApiError('NOT_FOUND', 'Order not found');
  return addCustomerOrderItemImages(order);
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
  excludeOrderId?: string;
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
 * Shared by `listOrders` and `getOrderCounts` — every filter EXCEPT `status`/`paymentStatus`,
 * which the two callers apply differently (`listOrders` applies both as given; `getOrderCounts`
 * deliberately drops both from its "total" count and re-applies each as its own separate count —
 * see that function's own doc comment). Keeping this one builder is what "same where-builder
 * logic, don't duplicate the filter-building code" (the approved plan) actually means here.
 */
function buildBaseOrderWhere(
  scopedVendorId: string | undefined,
  opts: Pick<OrderListFilters, 'branchId' | 'customerId' | 'excludeOrderId' | 'createdFrom' | 'createdTo' | 'search'>,
): Prisma.OrderWhereInput {
  return {
    ...(scopedVendorId ? { items: { some: { vendorId: scopedVendorId } } } : {}),
    ...(opts.branchId ? { items: { some: { branchId: opts.branchId } } } : {}),
    ...(opts.customerId ? { customerId: opts.customerId } : {}),
    // "Customer's Other Orders" — excludes the one order currently being viewed.
    ...(opts.excludeOrderId ? { id: { not: opts.excludeOrderId } } : {}),
    ...(opts.createdFrom || opts.createdTo
      ? {
          createdAt: {
            ...(opts.createdFrom ? { gte: new Date(opts.createdFrom) } : {}),
            ...(opts.createdTo ? { lte: new Date(opts.createdTo) } : {}),
          },
        }
      : {}),
    // Additive: customer phone + the checkout-time `contactPhone` snapshot (relevant for a
    // legacy/unlinked order — see this app's own "purchase-time contact snapshot" doc comment),
    // on top of the pre-existing vendor/branch/customer-name/item-name matches.
    ...(opts.search
      ? {
          OR: [
            { vendorNameSnapshot: { contains: opts.search, mode: 'insensitive' as const } },
            { branchNameSnapshot: { contains: opts.search, mode: 'insensitive' as const } },
            { customer: { is: { name: { contains: opts.search, mode: 'insensitive' as const } } } },
            { customer: { is: { phone: { contains: opts.search } } } },
            { contactPhone: { contains: opts.search } },
            { items: { some: { itemName: { contains: opts.search, mode: 'insensitive' as const } } } },
            { items: { some: { vendorNameSnapshot: { contains: opts.search, mode: 'insensitive' as const } } } },
          ],
        }
      : {}),
  };
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
/** ALL = the caller holds orders:{action}; OWN = member self-service, own business only. */
export type OrderScope = 'ALL' | 'OWN';

export async function listOrders(callerUserId: string, scope: OrderScope, opts: OrderListFilters) {
  const vendor = await getVendorByOwnerUserId(callerUserId);
  if (scope === 'OWN' && !vendor) return { items: [], total: 0 };
  const scopedVendorId = vendor ? vendor.id : opts.vendorId;
  // One `items` filter: a branchId must narrow the caller's own business, never replace it.
  const itemFilter = {
    ...(scopedVendorId ? { vendorId: scopedVendorId } : {}),
    ...(opts.branchId ? { branchId: opts.branchId } : {}),
  };
  const where = {
    ...(Object.keys(itemFilter).length ? { items: { some: itemFilter } } : {}),
    ...(opts.customerId ? { customerId: opts.customerId } : {}),
    ...(opts.status ? { status: opts.status } : {}),
    // Order has no single "payment status" column of its own (Order 1 -> Payment[]) — this
    // matches "has at least one payment attempt in this state", not "the current/latest one".
    ...(opts.paymentStatus ? { payments: { some: { status: opts.paymentStatus } } } : {}),
  };
  const [rawItems, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize, include: ORDER_INCLUDE }),
    prisma.order.count({ where }),
  ]);
  const items = vendor ? rawItems.map((order) => scopeOrderItemsToVendor(order, vendor.id)) : rawItems;
  return { items, total };
}

/**
 * The Order History page's three summary cards (All / Paid / Awaiting Payment) — deliberately
 * "unfiltered by status": every OTHER filter on the page (vendor/branch/customer/search/date, and
 * the same vendor-self force-scoping `listOrders` applies) still narrows these three counts, but
 * whichever `status`/`paymentStatus` the admin currently has selected does NOT — the cards stay a
 * stable "of everything matching my other filters" context, never collapsing to match the one
 * status row currently on screen. Always 3 cheap `count()`s, never `findMany` — the visible page
 * must never be the source of these numbers (a paginated page can't know the true total).
 */
export async function getOrderCounts(
  callerUserId: string,
  opts: Pick<OrderListFilters, 'vendorId' | 'branchId' | 'customerId' | 'excludeOrderId' | 'createdFrom' | 'createdTo' | 'search'>,
) {
  const vendor = await getVendorByOwnerUserId(callerUserId);
  const scopedVendorId = vendor ? vendor.id : opts.vendorId;
  const baseWhere = buildBaseOrderWhere(scopedVendorId, opts);

  const [total, paid, pendingPayment] = await Promise.all([
    prisma.order.count({ where: baseWhere }),
    prisma.order.count({ where: { ...baseWhere, payments: { some: { status: 'PAID' } } } }),
    prisma.order.count({ where: { ...baseWhere, status: 'PENDING_PAYMENT' } }),
  ]);

  return { total, paid, pendingPayment };
}

/** Same vendor-scoping rule as listOrders — a vendor requesting an order none of its own deals
 *  are part of 404s (never confirms existence), and the returned order's items[] are filtered
 *  to the caller's own vendor only. */
export async function getOrderOrThrow(callerUserId: string, scope: OrderScope, id: string) {
  const vendor = await getVendorByOwnerUserId(callerUserId);
  if (scope === 'OWN' && !vendor) throw new ApiError('NOT_FOUND', 'Order not found');
  const order = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
  if (!order) throw new ApiError('NOT_FOUND', 'Order not found');
  if (!vendor) return order;
  const scoped = scopeOrderItemsToVendor(order, vendor.id);
  if (scoped.items.length === 0) throw new ApiError('NOT_FOUND', 'Order not found');
  return scoped;
}

/**
 * Order Details page's "Activity History" — a single chronological feed of every `AuditLog` row
 * about this order OR any of its own items' entitlements/disputes/refunds, written under four
 * different `targetType`s by four different call sites (orders.routes.ts's `Order`-targeted
 * rows; vouchers.routes.ts's/disputes.routes.ts's/refunds.routes.ts's `PurchaseEntitlement`/
 * `PurchaseDispute`/`Refund`-targeted rows — none of which key by `orderId`). No dedicated table
 * joins these together, so this aggregates the id sets first, then does ONE `auditLog.findMany`
 * with an `OR` across the four `(targetType, targetId IN […])` pairs.
 *
 * Reuses `getOrderOrThrow`'s existing ownership/vendor-scoping check instead of a parallel one —
 * same 404-not-403 discipline, and a vendor caller on a multi-vendor order only ever sees activity
 * for ITS OWN items' entitlements/disputes/refunds (the order-level `Order`-targeted rows are
 * still included for every caller who can see the order at all, since Order.status/payment
 * events aren't vendor-split).
 */
export async function getOrderActivityHistory(callerUserId: string, id: string) {
  const order = await getOrderOrThrow(callerUserId, id);
  const itemIds = order.items.map((item) => item.id);

  const items = itemIds.length
    ? await prisma.orderItem.findMany({
        where: { id: { in: itemIds } },
        select: {
          id: true,
          purchaseEntitlements: { select: { id: true, disputes: { select: { id: true } } } },
          refunds: { select: { id: true } },
        },
      })
    : [];

  const entitlementIds = items.flatMap((item) => item.purchaseEntitlements.map((e) => e.id));
  const disputeIds = items.flatMap((item) => item.purchaseEntitlements.flatMap((e) => e.disputes.map((d) => d.id)));
  const refundIds = items.flatMap((item) => item.refunds.map((r) => r.id));

  return prisma.auditLog.findMany({
    where: {
      OR: [
        { targetType: 'Order', targetId: id },
        ...(entitlementIds.length ? [{ targetType: 'PurchaseEntitlement', targetId: { in: entitlementIds } }] : []),
        ...(disputeIds.length ? [{ targetType: 'PurchaseDispute', targetId: { in: disputeIds } }] : []),
        ...(refundIds.length ? [{ targetType: 'Refund', targetId: { in: refundIds } }] : []),
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
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
 * Staff with `orders:status_change` (Super Admin, Admin) move an order through
 * ADMIN_ALLOWED_TRANSITIONS. Members never change an order, deal or product (D27); the route's
 * permission check refuses them before this runs.
 */
export async function setOrderStatus(id: string, status: OrderStatus, reason?: string) {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new ApiError('NOT_FOUND', 'Order not found');

  if (!ADMIN_ALLOWED_TRANSITIONS[order.status].includes(status)) {
    throw new ApiError('CONFLICT', `Cannot change status from ${order.status} to ${status}`);
  }

  return prisma.order.update({
    where: { id },
    data: { status, cancellationReason: status === 'CANCELLED' ? (reason ?? order.cancellationReason) : order.cancellationReason },
    include: ORDER_INCLUDE,
  });
}
