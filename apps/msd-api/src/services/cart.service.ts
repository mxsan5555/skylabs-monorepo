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

/** One CART_INCLUDE covers all three CartItem shapes (Service-Deal, Product, Therapist — see
 *  CartItem's own schema doc comment) — `dealPackage`/`therapist`/`therapistPackage`/`product`
 *  are simply null on whichever lines they don't apply to. */
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
          durationMinutes: true,
          images: true,
          vendorId: true,
          branchId: true,
          vendor: { select: { id: true, businessName: true } },
          branch: { select: { id: true, name: true } },
          mediaImages: { orderBy: DEAL_IMAGE_ORDER_BY },
        },
      },
      dealPackage: { select: { id: true, durationMinutes: true, sellingPrice: true } },
      therapist: {
        select: {
          id: true,
          therapistType: true,
          personName: true,
          photoUrl: true,
          vendorId: true,
          branchId: true,
          vendor: { select: { id: true, businessName: true } },
          branch: { select: { id: true, name: true } },
        },
      },
      therapistPackage: { select: { id: true, durationMinutes: true, sellingPrice: true } },
      product: {
        select: {
          id: true,
          name: true,
          image: true,
          imageAlt: true,
          price: true,
          originalPrice: true,
          vendorId: true,
          vendor: { select: { id: true, businessName: true } },
          mediaImages: { orderBy: PRODUCT_IMAGE_ORDER_BY },
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

/** Product line — `productId` alone, entirely independent of any Deal (Product is a fully
 *  independent, directly-purchasable catalog entity — see Product's own schema doc comment).
 *  Mirrors `catalog.service.ts`'s `VISIBLE_PRODUCT_WHERE` bar: active product, active vendor. */
async function assertProduct(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId }, include: { vendor: { select: { status: true } } } });
  if (!product) throw new ApiError('NOT_FOUND', 'Product not found');
  if (!product.isActive || product.vendor.status !== 'ACTIVE') {
    throw new ApiError('VALIDATION_ERROR', 'Selected product is not currently available');
  }
  return { unitPrice: product.price };
}

/** Service-Deal line — `dealId` + `dealPackageId`. Never trusts a client-supplied price: the
 *  package's own live `sellingPrice` is authoritative, re-checked again at checkout
 *  (order.service.ts#createOrderFromCart) since CartItem.unitPrice is only provisional. */
async function assertServiceDeal(dealId: string, dealPackageId: string) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new ApiError('NOT_FOUND', 'Deal not found');
  const pkg = await prisma.dealPackage.findUnique({ where: { id: dealPackageId } });
  if (!pkg || pkg.dealId !== deal.id) throw new ApiError('NOT_FOUND', 'Deal package not found');
  if (!pkg.isActive) throw new ApiError('VALIDATION_ERROR', 'Selected package is not currently available');
  return { unitPrice: pkg.sellingPrice };
}

/** Therapist line — `therapistId` + `therapistPackageId`, entirely independent of any Deal (see
 *  Therapist's own schema doc comment — a Deal and a Therapist are always separate cart lines,
 *  never coupled together on one CartItem). */
async function assertTherapist(therapistId: string, therapistPackageId: string) {
  const therapist = await prisma.therapist.findUnique({ where: { id: therapistId } });
  if (!therapist) throw new ApiError('NOT_FOUND', 'Therapist not found');
  if (!therapist.isActive) throw new ApiError('VALIDATION_ERROR', 'Selected therapist is not currently available');
  const pkg = await prisma.therapistPackage.findUnique({ where: { id: therapistPackageId } });
  if (!pkg || pkg.therapistId !== therapist.id) throw new ApiError('NOT_FOUND', 'Therapist package not found');
  if (!pkg.isActive) throw new ApiError('VALIDATION_ERROR', 'Selected package is not currently available');
  return { unitPrice: pkg.sellingPrice };
}

/** A cart id/item belonging to a different customer 404s (not 403) — never confirms existence
 *  to someone it doesn't belong to. */
async function getOwnedCartItemOrThrow(customerId: string, itemId: string) {
  const item = await prisma.cartItem.findUnique({ where: { id: itemId }, include: { cart: true } });
  if (!item || item.cart.customerId !== customerId) throw new ApiError('NOT_FOUND', 'Cart item not found');
  return item;
}

/**
 * Adds one of the three CartItem shapes (see CartItem's own schema doc comment): a Service-Deal
 * line (`dealId` + `dealPackageId`), a Product line (`productId` alone), or a Therapist line
 * (`therapistId` + `therapistPackageId`) — `cart.schema.ts#CartAddItemSchema`'s refinement already
 * guarantees the request matches exactly one of these shapes.
 *
 * The compound unique index on CartItem (`cartId, dealId, dealPackageId, therapistId,
 * therapistPackageId, productId`) treats NULLs as pairwise-distinct (Postgres unique-index
 * semantics — see that index's own schema doc comment), so it can never behave as an upsert key
 * by itself when some fields are null. This does an explicit `findFirst` match on the exact shape
 * submitted as an application-level dedupe/increment, the same defense-in-depth discipline the
 * schema comment calls for.
 *
 * Multi-vendor: a cart may hold lines from any number of different vendors/branches — each
 * line's own deal/therapist/product relation is authoritative, so there is no vendor/branch
 * conflict check here. Checkout groups items by vendor when creating the Order — see
 * order.service.ts#createOrderFromCart.
 */
export async function addItem(customerId: string, input: CartAddItemInput) {
  const isTherapistLine = !!input.therapistId;
  const isProductLine = !isTherapistLine && !!input.productId;

  const { unitPrice } = isTherapistLine
    ? await assertTherapist(input.therapistId!, input.therapistPackageId!)
    : isProductLine
      ? await assertProduct(input.productId!)
      : await assertServiceDeal(input.dealId!, input.dealPackageId!);

  const cart = await prisma.cart.upsert({ where: { customerId }, update: {}, create: { customerId } });

  const matchWhere = {
    cartId: cart.id,
    dealId: isTherapistLine || isProductLine ? null : input.dealId!,
    dealPackageId: isTherapistLine || isProductLine ? null : input.dealPackageId!,
    therapistId: isTherapistLine ? input.therapistId! : null,
    therapistPackageId: isTherapistLine ? input.therapistPackageId! : null,
    productId: isProductLine ? input.productId! : null,
  };
  const existingItem = await prisma.cartItem.findFirst({ where: matchWhere });

  if (existingItem) {
    await prisma.cartItem.update({ where: { id: existingItem.id }, data: { quantity: existingItem.quantity + input.quantity } });
  } else {
    await prisma.cartItem.create({ data: { ...matchWhere, quantity: input.quantity, unitPrice } });
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
