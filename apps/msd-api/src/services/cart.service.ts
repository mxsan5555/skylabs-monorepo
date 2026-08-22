import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import type { Prisma } from '../generated/prisma-client';
import type { CartAddItemSchema } from '../schemas/cart.schema';

type CartAddItemInput = z.infer<typeof CartAddItemSchema>;

/** Declared outside CART_INCLUDE's own `as const` (and explicitly typed, not inferred) so this
 *  stays the mutable array Prisma's generated types expect — nesting a plain array literal
 *  directly inside an `as const` object freezes it into a readonly tuple, which
 *  `DealImageOrderByWithRelationInput[]`/`ProductImageOrderByWithRelationInput[]` reject (caught
 *  by the webpack/ts-loader production build, not by a plain `tsc --noEmit` run — same gotcha as
 *  vendor.service.ts's DEAL_PACKAGE_ORDER_BY). */
const DEAL_IMAGE_ORDER_BY: Prisma.DealImageOrderByWithRelationInput[] = [{ isPrimary: 'desc' }, { sortOrder: 'asc' }];
const PRODUCT_IMAGE_ORDER_BY: Prisma.ProductImageOrderByWithRelationInput[] = [{ isPrimary: 'desc' }, { sortOrder: 'asc' }];

const CART_INCLUDE = {
  items: {
    include: {
      deal: {
        select: {
          id: true,
          title: true,
          slug: true,
          salePrice: true,
          originalPrice: true,
          images: true,
          vendorId: true,
          branchId: true,
          vendor: { select: { id: true, businessName: true } },
          branch: { select: { id: true, name: true } },
          product: {
            select: {
              id: true,
              name: true,
              image: true,
              imageAlt: true,
              mediaImages: { orderBy: PRODUCT_IMAGE_ORDER_BY },
            },
          },
          mediaImages: { orderBy: DEAL_IMAGE_ORDER_BY },
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

/** Lazily creates an empty cart for the caller if none exists — Cart.customerId is unique, so
 *  this is a plain upsert-by-customerId. customerId is always req.user.sub (route layer). */
export async function getOrCreateCart(customerId: string) {
  return prisma.cart.upsert({
    where: { customerId },
    update: {},
    create: { customerId },
    include: CART_INCLUDE,
  });
}

async function assertProductDeal(dealId: string) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new ApiError('NOT_FOUND', 'Deal not found');
  if (!deal.productId) throw new ApiError('VALIDATION_ERROR', 'Only product deals can be added to a cart');
  return deal;
}

/** A cart id/item belonging to a different customer 404s (not 403) — never confirms existence
 *  to someone it doesn't belong to, matching Booking's equivalent check. */
async function getOwnedCartItemOrThrow(customerId: string, itemId: string) {
  const item = await prisma.cartItem.findUnique({ where: { id: itemId }, include: { cart: true } });
  if (!item || item.cart.customerId !== customerId) throw new ApiError('NOT_FOUND', 'Cart item not found');
  return item;
}

/** Multi-vendor: a cart may hold product deals from any number of vendors/branches — each
 *  CartItem's own `deal.vendorId`/`deal.branchId` is authoritative (see CART_INCLUDE), so there
 *  is no vendor/branch conflict check here anymore. Checkout groups items by vendor when
 *  creating the Order — see order.service.ts#createOrderFromCart. */
export async function addItem(customerId: string, input: CartAddItemInput) {
  const deal = await assertProductDeal(input.dealId);
  const cart = await prisma.cart.upsert({ where: { customerId }, update: {}, create: { customerId } });

  const existingItem = await prisma.cartItem.findUnique({ where: { cartId_dealId: { cartId: cart.id, dealId: deal.id } } });
  if (existingItem) {
    await prisma.cartItem.update({ where: { id: existingItem.id }, data: { quantity: existingItem.quantity + input.quantity } });
  } else {
    await prisma.cartItem.create({ data: { cartId: cart.id, dealId: deal.id, quantity: input.quantity, unitPrice: deal.salePrice } });
  }

  return getOrCreateCart(customerId);
}

export async function updateItemQuantity(customerId: string, itemId: string, quantity: number) {
  await getOwnedCartItemOrThrow(customerId, itemId);
  await prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
  return getOrCreateCart(customerId);
}

export async function removeItem(customerId: string, itemId: string) {
  await getOwnedCartItemOrThrow(customerId, itemId);
  await prisma.cartItem.delete({ where: { id: itemId } });
  return getOrCreateCart(customerId);
}

export async function clearCart(customerId: string) {
  const cart = await prisma.cart.upsert({ where: { customerId }, update: {}, create: { customerId } });
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  return getOrCreateCart(customerId);
}
