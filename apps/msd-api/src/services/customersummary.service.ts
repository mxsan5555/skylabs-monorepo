import { prisma } from '../lib/prisma';
import { OrderStatus, OrderType } from '../generated/prisma-client';

const PAID_ORDER_STATUSES = [
  OrderStatus.CONFIRMED,
  OrderStatus.COMPLETED,
] as const;

export async function getMyDashboardSummary(customerId: string) {
  const [serviceItems, productItems, cartItems, wishlistItemCount] =
    await Promise.all([
      prisma.orderItem.aggregate({
        where: {
          itemType: OrderType.SERVICE,
          order: {
            customerId,
            status: {
              in: [...PAID_ORDER_STATUSES],
            },
          },
        },
        _sum: {
          quantity: true,
        },
      }),

      prisma.orderItem.aggregate({
        where: {
          itemType: OrderType.PRODUCT,
          order: {
            customerId,
            status: {
              in: [...PAID_ORDER_STATUSES],
            },
          },
        },
        _sum: {
          quantity: true,
        },
      }),

      prisma.cartItem.aggregate({
        where: {
          cart: {
            customerId,
          },
        },
        _sum: {
          quantity: true,
        },
      }),

      prisma.wishlistItem.count({
        where: {
          customerId,
        },
      }),
    ]);

  return {
    totalDealCount: serviceItems._sum.quantity ?? 0,
    totalProductBoughtCount: productItems._sum.quantity ?? 0,
    cartItemCount: cartItems._sum.quantity ?? 0,
    wishlistItemCount,
  };
}