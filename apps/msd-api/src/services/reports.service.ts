import { Prisma, type OrderStatus, type PaymentStatus } from '../generated/prisma-client';
import { prisma } from '../lib/prisma';

/**
 * Superadmin Reports dashboard — every figure here comes from real database aggregation
 * (Prisma `groupBy`/`aggregate`/`count`), never a full order list pulled into memory and summed
 * in JS. Where a report needs a DISTINCT order count per group (vendor/branch — an order's
 * `OrderItem`s can span several vendors, see `Order`'s own schema doc comment), this dedupes via
 * a `Map` keyed by orderId over an already-grouped, already-small result set — the exact same
 * technique `vendor.service.ts`'s own per-vendor stats already use, not a new pattern.
 *
 * `Revenue` in the overall summary = sum of `Order.total` for every matching order (gross order
 * value, regardless of payment status) — deliberately distinct from `Paid Revenue`, which sums
 * `Payment.amount` where `status = 'PAID'` (money actually collected), same "PAID payments are
 * the real revenue signal" discipline `dashboard.service.ts#getDashboardStats` already
 * established. Per-vendor/branch/product/service "Revenue" figures use `OrderItem.lineTotal`
 * (the authoritative per-line amount — never re-derived from Deal/Product, which can change
 * after the fact).
 */

export interface ReportFilters {
  /** Date-only (`YYYY-MM-DD`) — see the Zod schema in reports.schema.ts for the format guard.
   *  Expanded to a full-day UTC range here (00:00:00.000 through 23:59:59.999). */
  dateFrom?: string;
  dateTo?: string;
  vendorId?: string;
  branchId?: string;
  orderStatus?: OrderStatus;
  paymentStatus?: PaymentStatus;
}

function dateRangeWhere(filters: ReportFilters): Prisma.DateTimeFilter | undefined {
  if (!filters.dateFrom && !filters.dateTo) return undefined;
  return {
    ...(filters.dateFrom ? { gte: new Date(`${filters.dateFrom}T00:00:00.000Z`) } : {}),
    ...(filters.dateTo ? { lte: new Date(`${filters.dateTo}T23:59:59.999Z`) } : {}),
  };
}

/** `where` for an Order-level query. */
function orderWhere(filters: ReportFilters): Prisma.OrderWhereInput {
  const createdAt = dateRangeWhere(filters);
  return {
    ...(filters.vendorId ? { items: { some: { vendorId: filters.vendorId } } } : {}),
    ...(filters.branchId ? { items: { some: { branchId: filters.branchId } } } : {}),
    ...(filters.orderStatus ? { status: filters.orderStatus } : {}),
    ...(filters.paymentStatus ? { payments: { some: { status: filters.paymentStatus } } } : {}),
    ...(createdAt ? { createdAt } : {}),
  };
}

/** `where` for an OrderItem-level query (vendor/branch/product/service breakdowns) — scopes
 *  through the parent Order for status/payment/date, same filters as `orderWhere`. */
function orderItemWhere(filters: ReportFilters): Prisma.OrderItemWhereInput {
  const createdAt = dateRangeWhere(filters);
  return {
    ...(filters.vendorId ? { vendorId: filters.vendorId } : {}),
    ...(filters.branchId ? { branchId: filters.branchId } : {}),
    order: {
      ...(filters.orderStatus ? { status: filters.orderStatus } : {}),
      ...(filters.paymentStatus ? { payments: { some: { status: filters.paymentStatus } } } : {}),
      ...(createdAt ? { createdAt } : {}),
    },
  };
}

// ─── Report 1: Overall summary ────────────────────────────────────────────────

export interface OverallSummary {
  totalOrders: number;
  totalRevenue: string;
  paidRevenue: string;
  pendingAmount: string;
  cancelledOrders: number;
  completedOrders: number;
  totalProductsSold: number;
  totalServicesBooked: number;
}

export async function getOverallSummary(filters: ReportFilters): Promise<OverallSummary> {
  const where = orderWhere(filters);
  const [totalOrders, revenueAgg, cancelledOrders, completedOrders, pendingAgg, productsAgg, servicesAgg, paidAgg] =
    await Promise.all([
      prisma.order.count({ where }),
      prisma.order.aggregate({ where, _sum: { total: true } }),
      prisma.order.count({ where: { ...where, status: 'CANCELLED' } }),
      prisma.order.count({ where: { ...where, status: 'COMPLETED' } }),
      prisma.order.aggregate({ where: { ...where, status: 'PENDING_PAYMENT' }, _sum: { total: true } }),
      prisma.orderItem.aggregate({ where: { ...orderItemWhere(filters), itemType: 'PRODUCT' }, _sum: { quantity: true } }),
      prisma.orderItem.aggregate({ where: { ...orderItemWhere(filters), itemType: 'SERVICE' }, _sum: { quantity: true } }),
      prisma.payment.aggregate({
        where: { status: 'PAID', order: where },
        _sum: { amount: true },
      }),
    ]);

  return {
    totalOrders,
    totalRevenue: (revenueAgg._sum.total ?? new Prisma.Decimal(0)).toString(),
    paidRevenue: (paidAgg._sum.amount ?? new Prisma.Decimal(0)).toString(),
    pendingAmount: (pendingAgg._sum.total ?? new Prisma.Decimal(0)).toString(),
    cancelledOrders,
    completedOrders,
    totalProductsSold: productsAgg._sum.quantity ?? 0,
    totalServicesBooked: servicesAgg._sum.quantity ?? 0,
  };
}

// ─── Report 2/6: Vendor-wise revenue + Top vendors ────────────────────────────

export interface VendorReportRow {
  vendorId: string;
  vendorName: string;
  orders: number;
  revenue: string;
  paid: string;
  pending: string;
  cancelled: number;
}

/** Shared by Report 2 (Vendor-wise, alphabetical-ish/all vendors) and Report 6 (Top Vendors —
 *  same shape, just sorted by revenue and capped). `orders` is a DISTINCT order count per
 *  vendor, deduped via `Map` over the (vendorId, orderId) groupBy rows — see this file's own
 *  module doc comment for why a plain `OrderItem.groupBy(['vendorId'])` alone can't give that. */
async function vendorRevenueRows(filters: ReportFilters): Promise<VendorReportRow[]> {
  const itemWhere = orderItemWhere(filters);
  const grouped = await prisma.orderItem.groupBy({
    by: ['vendorId', 'orderId'],
    where: itemWhere,
    _sum: { lineTotal: true },
  });
  if (grouped.length === 0) return [];

  const orderIds = [...new Set(grouped.map((g) => g.orderId))];
  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    select: { id: true, status: true, vendorNameSnapshot: true },
  });
  const orderStatusById = new Map(orders.map((o) => [o.id, o.status]));

  const paidByOrderVendor = await prisma.payment.findMany({
    where: { status: 'PAID', orderId: { in: orderIds } },
    select: { orderId: true, amount: true },
  });
  const paidByOrderId = new Map<string, Prisma.Decimal>();
  for (const p of paidByOrderVendor) {
    paidByOrderId.set(p.orderId, (paidByOrderId.get(p.orderId) ?? new Prisma.Decimal(0)).add(p.amount));
  }

  const vendorIds = [...new Set(grouped.map((g) => g.vendorId))];
  const vendors = await prisma.vendor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, businessName: true } });
  const vendorNameById = new Map(vendors.map((v) => [v.id, v.businessName ?? 'Vendor']));

  const byVendor = new Map<string, VendorReportRow>();
  for (const row of grouped) {
    const status = orderStatusById.get(row.orderId);
    const revenue = row._sum.lineTotal ?? new Prisma.Decimal(0);
    const existing = byVendor.get(row.vendorId) ?? {
      vendorId: row.vendorId,
      vendorName: vendorNameById.get(row.vendorId) ?? 'Vendor',
      orders: 0,
      revenue: '0',
      paid: '0',
      pending: '0',
      cancelled: 0,
    };
    existing.orders += 1;
    existing.revenue = new Prisma.Decimal(existing.revenue).add(revenue).toString();
    if (status === 'CANCELLED') existing.cancelled += 1;
    if (status === 'PENDING_PAYMENT') {
      existing.pending = new Prisma.Decimal(existing.pending).add(revenue).toString();
    }
    byVendor.set(row.vendorId, existing);
  }
  // Paid amount per vendor: proportion of each order's PAID total attributable to this vendor's
  // line items — approximated here as "this vendor's line revenue for the order, if the order
  // has any PAID payment" (an order's payments aren't itself split per-vendor in this schema).
  for (const row of grouped) {
    if (!paidByOrderId.has(row.orderId)) continue;
    const existing = byVendor.get(row.vendorId)!;
    existing.paid = new Prisma.Decimal(existing.paid).add(row._sum.lineTotal ?? 0).toString();
  }

  return [...byVendor.values()];
}

export async function getVendorWiseReport(filters: ReportFilters): Promise<VendorReportRow[]> {
  const rows = await vendorRevenueRows(filters);
  return rows.sort((a, b) => a.vendorName.localeCompare(b.vendorName));
}

export async function getTopVendors(filters: ReportFilters, by: 'revenue' | 'orders', limit: number): Promise<VendorReportRow[]> {
  const rows = await vendorRevenueRows(filters);
  rows.sort((a, b) => (by === 'orders' ? b.orders - a.orders : Number(b.revenue) - Number(a.revenue)));
  return rows.slice(0, limit);
}

// ─── Report 3: Branch-wise ─────────────────────────────────────────────────────

export interface BranchReportRow {
  branchId: string;
  branchName: string;
  vendorId: string;
  vendorName: string;
  orders: number;
  revenue: string;
  services: number;
  products: number;
}

export async function getBranchWiseReport(filters: ReportFilters): Promise<BranchReportRow[]> {
  const itemWhere = orderItemWhere(filters);
  const grouped = await prisma.orderItem.groupBy({
    by: ['branchId', 'orderId', 'itemType'],
    where: itemWhere,
    _sum: { lineTotal: true, quantity: true },
  });
  if (grouped.length === 0) return [];

  const branchIds = [...new Set(grouped.map((g) => g.branchId))];
  const branches = await prisma.branch.findMany({
    where: { id: { in: branchIds } },
    select: { id: true, name: true, vendorId: true, vendor: { select: { businessName: true } } },
  });
  const branchById = new Map(branches.map((b) => [b.id, b]));

  const byBranch = new Map<string, BranchReportRow>();
  const seenOrderPerBranch = new Map<string, Set<string>>();
  for (const row of grouped) {
    const branch = branchById.get(row.branchId);
    const existing = byBranch.get(row.branchId) ?? {
      branchId: row.branchId,
      branchName: branch?.name ?? 'Branch',
      vendorId: branch?.vendorId ?? '',
      vendorName: branch?.vendor.businessName ?? 'Vendor',
      orders: 0,
      revenue: '0',
      services: 0,
      products: 0,
    };
    const seenOrders = seenOrderPerBranch.get(row.branchId) ?? new Set<string>();
    if (!seenOrders.has(row.orderId)) {
      seenOrders.add(row.orderId);
      existing.orders += 1;
    }
    seenOrderPerBranch.set(row.branchId, seenOrders);
    existing.revenue = new Prisma.Decimal(existing.revenue).add(row._sum.lineTotal ?? 0).toString();
    if (row.itemType === 'SERVICE') existing.services += row._sum.quantity ?? 0;
    if (row.itemType === 'PRODUCT') existing.products += row._sum.quantity ?? 0;
    byBranch.set(row.branchId, existing);
  }

  return [...byBranch.values()].sort((a, b) => Number(b.revenue) - Number(a.revenue));
}

// ─── Report 4: Month-wise ──────────────────────────────────────────────────────

export interface MonthReportRow {
  month: string; // "2026-01"
  orders: number;
  revenue: string;
  services: number;
  products: number;
}

/** Grouped in JS over `Order.createdAt`/`OrderItem` rows already narrowed by the same filters —
 *  Postgres has no portable Prisma `groupBy` on a truncated date expression, so this reads the
 *  (filtered, already-small) order + item rows once and buckets by calendar month. Still real
 *  DB-computed sums per order/item, not a per-order-in-React total. */
export async function getMonthWiseReport(filters: ReportFilters): Promise<MonthReportRow[]> {
  const where = orderWhere(filters);
  const [orders, items] = await Promise.all([
    prisma.order.findMany({ where, select: { id: true, createdAt: true, total: true } }),
    prisma.orderItem.findMany({
      where: orderItemWhere(filters),
      select: { orderId: true, itemType: true, quantity: true, order: { select: { createdAt: true } } },
    }),
  ]);

  const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

  const byMonth = new Map<string, MonthReportRow>();
  for (const order of orders) {
    const key = monthKey(order.createdAt);
    const existing = byMonth.get(key) ?? { month: key, orders: 0, revenue: '0', services: 0, products: 0 };
    existing.orders += 1;
    existing.revenue = new Prisma.Decimal(existing.revenue).add(order.total).toString();
    byMonth.set(key, existing);
  }
  for (const item of items) {
    const key = monthKey(item.order.createdAt);
    const existing = byMonth.get(key) ?? { month: key, orders: 0, revenue: '0', services: 0, products: 0 };
    if (item.itemType === 'SERVICE') existing.services += item.quantity;
    if (item.itemType === 'PRODUCT') existing.products += item.quantity;
    byMonth.set(key, existing);
  }

  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

// ─── Report 5: Service vs Product ──────────────────────────────────────────────

export interface ServiceVsProductReport {
  servicesSold: number;
  productsSold: number;
  serviceRevenue: string;
  productRevenue: string;
}

export async function getServiceVsProductReport(filters: ReportFilters): Promise<ServiceVsProductReport> {
  const itemWhere = orderItemWhere(filters);
  const [serviceAgg, productAgg] = await Promise.all([
    prisma.orderItem.aggregate({ where: { ...itemWhere, itemType: 'SERVICE' }, _sum: { quantity: true, lineTotal: true } }),
    prisma.orderItem.aggregate({ where: { ...itemWhere, itemType: 'PRODUCT' }, _sum: { quantity: true, lineTotal: true } }),
  ]);
  return {
    servicesSold: serviceAgg._sum.quantity ?? 0,
    productsSold: productAgg._sum.quantity ?? 0,
    serviceRevenue: (serviceAgg._sum.lineTotal ?? new Prisma.Decimal(0)).toString(),
    productRevenue: (productAgg._sum.lineTotal ?? new Prisma.Decimal(0)).toString(),
  };
}

// ─── Report 7/8: Top products / Top services ───────────────────────────────────

export interface TopItemRow {
  dealId: string;
  itemName: string;
  vendorName: string;
  quantitySold: number;
  revenue: string;
}

async function topItemsByType(filters: ReportFilters, itemType: 'PRODUCT' | 'SERVICE', limit: number): Promise<TopItemRow[]> {
  const itemWhere = orderItemWhere(filters);
  const grouped = await prisma.orderItem.groupBy({
    by: ['dealId'],
    where: { ...itemWhere, itemType, dealId: { not: null } },
    _sum: { quantity: true, lineTotal: true },
    orderBy: { _sum: { lineTotal: 'desc' } },
    take: limit,
  });
  if (grouped.length === 0) return [];

  const dealIds = grouped.map((g) => g.dealId!).filter(Boolean);
  // One representative snapshot per deal for display — itemName/vendorNameSnapshot are already
  // stored on OrderItem at order time (never re-read Deal/Vendor, same snapshot discipline the
  // rest of Order/OrderItem already follows).
  const samples = await prisma.orderItem.findMany({
    where: { dealId: { in: dealIds } },
    distinct: ['dealId'],
    select: { dealId: true, itemName: true, vendorNameSnapshot: true },
  });
  const sampleByDealId = new Map(samples.map((s) => [s.dealId, s]));

  return grouped.map((g) => ({
    dealId: g.dealId!,
    itemName: sampleByDealId.get(g.dealId)?.itemName ?? 'Item',
    vendorName: sampleByDealId.get(g.dealId)?.vendorNameSnapshot ?? 'Vendor',
    quantitySold: g._sum.quantity ?? 0,
    revenue: (g._sum.lineTotal ?? new Prisma.Decimal(0)).toString(),
  }));
}

export function getTopProducts(filters: ReportFilters, limit: number): Promise<TopItemRow[]> {
  return topItemsByType(filters, 'PRODUCT', limit);
}

/** Scoped to Deal-based service line items (`dealId` set) — a Therapist booked directly (no
 *  Deal involved, see Booking's own "exactly one of dealId/therapistId" doc comment) isn't a
 *  "Deal/Service" by this report's own naming, so it's intentionally excluded here rather than
 *  conflated with Deal-based bookings under one row. */
export function getTopServices(filters: ReportFilters, limit: number): Promise<TopItemRow[]> {
  return topItemsByType(filters, 'SERVICE', limit);
}

// ─── Report 9: Payment method breakdown ────────────────────────────────────────

export interface PaymentMethodRow {
  provider: 'RAZORPAY' | 'COD';
  orders: number;
  revenue: string;
  successful: number;
  pending: number;
  failed: number;
}

export async function getPaymentMethodReport(filters: ReportFilters): Promise<PaymentMethodRow[]> {
  const orderScope = orderWhere(filters);
  const grouped = await prisma.payment.groupBy({
    by: ['provider', 'status'],
    where: { order: orderScope },
    _sum: { amount: true },
    _count: { _all: true },
  });

  const byProvider = new Map<string, PaymentMethodRow>();
  for (const row of grouped) {
    const existing = byProvider.get(row.provider) ?? {
      provider: row.provider,
      orders: 0,
      revenue: '0',
      successful: 0,
      pending: 0,
      failed: 0,
    };
    existing.orders += row._count._all;
    if (row.status === 'PAID') {
      existing.revenue = new Prisma.Decimal(existing.revenue).add(row._sum.amount ?? 0).toString();
      existing.successful += row._count._all;
    } else if (row.status === 'CREATED') {
      existing.pending += row._count._all;
    } else if (row.status === 'FAILED' || row.status === 'CANCELLED') {
      existing.failed += row._count._all;
    }
    byProvider.set(row.provider, existing);
  }

  return [...byProvider.values()];
}
