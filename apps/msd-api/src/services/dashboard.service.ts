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
    ? await prisma.vendor.findUnique({
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
    prisma.vendor.count(),

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
     * Payment belongs to an Order.
     *
     * We scope the payment through OrderItem.vendorId rather than
     * Order.vendorId for the same multi-vendor reason explained above.
     */
    prisma.payment.aggregate({
      _sum: {
        amount: true,
      },
      where: {
        status: 'PAID',
        order: {
          items: {
            some: {
              vendorId,
            },
          },
        },
      },
    }),
  ]);

  const revenue = (
    revenueAgg._sum.amount ?? new Prisma.Decimal(0)
  ).toString();

  /*
   * Vendor category access is queried separately because the
   * category counts are based on VendorCategoryAccess.
   */
  const categories = await prisma.vendorCategoryAccess.count({
    where: {
      vendorId,
      category: {
        parentId: null,
      },
    },
  });

  /*
   * Subcategories are inherited from the vendor's granted
   * top-level categories.
   */
  const subCategories = await prisma.category.count({
    where: {
      parentId: {
        not: null,
      },
      parent: {
        vendorAccess: {
          some: {
            vendorId,
          },
        },
      },
    },
  });

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
     * Number of top-level categories granted to this vendor.
     */
    categories,

    /*
     * Number of subcategories belonging to the vendor's
     * granted top-level categories.
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