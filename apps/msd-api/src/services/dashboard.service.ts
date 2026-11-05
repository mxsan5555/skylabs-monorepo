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
  therapists: number;
  revenue: string;
}

/**
 * Dashboard statistics.
 *
 * Scope rules:
 * - SuperAdmin/staff without an owning Vendor → marketplace-wide statistics.
 * - Vendor user → statistics scoped to that Vendor.
 *
 * Vendor identity is resolved server-side from User.id -> Vendor.ownerUserId.
 * No vendorId is accepted from the client.
 */
export async function getDashboardStats(
  userId?: string
): Promise<DashboardStats> {
  const vendor = userId
    ? await prisma.member.findUnique({
        where: {
          ownerUserId: userId,
        },
        select: {
          id: true,
        },
      })
    : null;

  /*
   * No Vendor is attached to this authenticated user.
   *
   * This preserves the existing marketplace-wide dashboard behavior for
   * SuperAdmin/staff accounts.
   */
  if (!vendor) {
    return getMarketplaceDashboardStats();
  }

  return getVendorDashboardStats(vendor.id);
}

/**
 * Marketplace-wide dashboard statistics.
 *
 * Used by SuperAdmin/staff users who do not own a Vendor.
 */
async function getMarketplaceDashboardStats(): Promise<DashboardStats> {
  const [
    vendors,
    customers,
    branches,
    categories,
    subCategories,
    products,
    deals,
    orders,
    therapists,
    revenueAgg,
  ] = await Promise.all([
    prisma.member.count(),

    prisma.user.count({
      where: {
        deletedAt: null,
        roles: {
          some: {
            role: {
              key: 'customer',
            },
          },
        },
      },
    }),

    prisma.branch.count(),

    prisma.category.count({
      where: {
        parentId: null,
      },
    }),

    prisma.category.count({
      where: {
        parentId: {
          not: null,
        },
      },
    }),

    prisma.product.count(),

    prisma.deal.count(),

    prisma.order.count(),

    prisma.therapist.count(),

    prisma.payment.aggregate({
      _sum: {
        amount: true,
      },
      where: {
        status: 'PAID',
      },
    }),
  ]);

  const revenue = (
    revenueAgg._sum.amount ?? new Prisma.Decimal(0)
  ).toString();

  return {
    vendors,
    customers,
    branches,
    categories,
    subCategories,
    products,
    deals,
    orders,
    therapists,
    revenue,
  };
}

/**
 * Vendor-scoped dashboard statistics.
 *
 * IMPORTANT:
 * Order.vendorId is only the "primary vendor" for backwards compatibility.
 * A multi-vendor Order can contain OrderItems belonging to multiple vendors.
 *
 * Therefore vendor authorization/counting for Orders and Payments uses:
 *
 * Order -> OrderItem.vendorId
 */
async function getVendorDashboardStats(
  vendorId: string
): Promise<DashboardStats> {
  const [
    branches,
    products,
    deals,
    orders,
    therapists,
    customerRows,
    revenueAgg,
  ] = await Promise.all([
    /*
     * Branches belonging to this vendor.
     */
    prisma.branch.count({
      where: {
        vendorId,
      },
    }),

    /*
     * Products belonging to this vendor.
     */
    prisma.product.count({
      where: {
        vendorId,
      },
    }),

    /*
     * Deals belonging to this vendor.
     */
    prisma.deal.count({
      where: {
        vendorId,
      },
    }),

    /*
     * Do NOT use:
     *
     * where: { vendorId }
     *
     * because Order.vendorId is only the primary vendor.
     *
     * A multi-vendor order can contain OrderItems belonging to
     * multiple vendors.
     */
    prisma.order.count({
      where: {
        items: {
          some: {
            vendorId,
          },
        },
      },
    }),

    prisma.therapist.count({
      where: {
        vendorId,
      },
    }),

    /*
     * Customers are Users who have at least one Order containing
     * an OrderItem belonging to this vendor.
     *
     * distinct customerId prevents the same customer from being
     * counted multiple times across multiple orders.
     */
    prisma.order.findMany({
      where: {
        items: {
          some: {
            vendorId,
          },
        },
      },
      select: {
        customerId: true,
      },
      distinct: ['customerId'],
    }),

    /*
     * Revenue = this member's own lines on paid orders. A payment covers the whole order, which
     * can hold other members' lines, so summing payments would show their money (item 5).
     */
    prisma.orderItem.aggregate({
      _sum: { lineTotal: true },
      where: { vendorId, order: { payments: { some: { status: 'PAID' } } } },
    }),
  ]);

  const revenue = (revenueAgg._sum.lineTotal ?? new Prisma.Decimal(0)).toString();

  /*
   * Categories and subcategories this member actually uses across its deals, products and
   * therapists (D10: categories are open to every member, so there are no grants to count).
   */
  const [dealCats, productCats, therapistCats] = await Promise.all([
    prisma.deal.findMany({ where: { vendorId }, select: { categoryId: true, subcategoryId: true }, distinct: ['categoryId', 'subcategoryId'] }),
    prisma.product.findMany({ where: { vendorId }, select: { categoryId: true, subcategoryId: true }, distinct: ['categoryId', 'subcategoryId'] }),
    prisma.therapist.findMany({ where: { vendorId, specializationCategoryId: { not: null } }, select: { specializationCategoryId: true }, distinct: ['specializationCategoryId'] }),
  ]);
  const usedCategoryIds = [
    ...new Set(
      [
        ...dealCats.flatMap((d) => [d.categoryId, d.subcategoryId]),
        ...productCats.flatMap((p) => [p.categoryId, p.subcategoryId]),
        ...therapistCats.map((t) => t.specializationCategoryId),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  const [categories, subCategories] = await Promise.all([
    prisma.category.count({ where: { id: { in: usedCategoryIds }, parentId: null } }),
    prisma.category.count({ where: { id: { in: usedCategoryIds }, parentId: { not: null } } }),
  ]);

  return {
    /*
     * The vendor dashboard represents the current vendor,
     * so this is one vendor rather than the global vendor count.
     */
    vendors: 1,

    /*
     * Number of unique customers who have ordered something
     * belonging to this vendor.
     */
    customers: customerRows.length,

    /*
     * Number of branches belonging to this vendor.
     */
    branches,

    /*
     * Number of top-level categories this member uses.
     */
    categories,

    /*
     * Number of subcategories this member uses.
     */
    subCategories,

    /*
     * Number of products belonging to this vendor.
     */
    products,

    /*
     * Number of deals belonging to this vendor.
     */
    deals,

    /*
     * Number of therapists assigned to this vendor.
     */
    therapists,

    /*
     * Number of orders containing at least one OrderItem
     * belonging to this vendor.
     */
    orders,

    /*
     * Paid revenue associated with orders containing
     * this vendor's order items.
     */
    revenue,
  };
}