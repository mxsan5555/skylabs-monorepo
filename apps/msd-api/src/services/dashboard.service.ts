import { Prisma } from '../generated/prisma-client';
import { prisma } from '../lib/prisma';

export interface DashboardStats {
  vendors: number;
  customers: number;
  branches: number;
  categories: number;
  subCategories: number;
  products: number;
  deals: number;
  orders: number;
  revenue: string;
}

/**
 * Aggregate marketplace counts for the admin dashboard — read-only, no per-entity breakdown
 * (never expose a vendor- or customer-identifying list from here).
 *
 * `revenue` sums `Payment.amount` where `Payment.status === 'PAID'`, not `Order.total` where
 * `Order.status === 'COMPLETED'`. Order.status only reaches COMPLETED via an explicit further
 * admin/vendor action AFTER payment (CONFIRMED -> COMPLETED, see order.service.ts's
 * ADMIN_ALLOWED_TRANSITIONS/VENDOR_ALLOWED_TRANSITIONS — payment verification itself only moves
 * an Order to CONFIRMED, see payment.service.ts's verifyPayment/handleWebhookEvent). Summing
 * Order.total at status=COMPLETED would silently exclude every already-paid CONFIRMED order that
 * simply hasn't been marked delivered/complete yet, undercounting money actually collected.
 * Payment.status='PAID' is the direct, unambiguous "money actually received" signal in this
 * schema, independent of downstream fulfillment status — the more accurate "revenue" figure.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const [
    vendors,
    customers,
    branches,
    categories,
    subCategories,
    products,
    deals,
    orders,
    revenueAgg,
  ] = await Promise.all([
    prisma.vendor.count(),
    prisma.user.count({ where: { deletedAt: null, roles: { some: { role: { key: 'customer' } } } } }),
    prisma.branch.count(),
    prisma.category.count({ where: { parentId: null } }),
    prisma.category.count({ where: { parentId: { not: null } } }),
    prisma.product.count(),
    prisma.deal.count(),
    prisma.order.count(),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { status: 'PAID' } }),
  ]);

  const revenue = (revenueAgg._sum.amount ?? new Prisma.Decimal(0)).toString();

  return { vendors, customers, branches, categories, subCategories, products, deals, orders, revenue };
}
