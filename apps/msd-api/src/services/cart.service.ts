import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import type { Prisma } from '../generated/prisma-client';
import type { CartAddItemSchema } from '../schemas/cart.schema';
import { VISIBLE_DEAL_WHERE, VISIBLE_THERAPIST_WHERE } from './catalog-visibility';

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
          status: true,
          approvalStatus: true,
          vendor: { select: { id: true, businessName: true, status: true } },
          branch: { select: { id: true, name: true, isActive: true } },
          mediaImages: { orderBy: DEAL_IMAGE_ORDER_BY },
        },
      },
      dealPackage: { select: { id: true, durationMinutes: true, sellingPrice: true, isActive: true } },
      therapist: {
        select: {
          id: true,
          therapistType: true,
          personName: true,
          photoUrl: true,
          vendorId: true,
          branchId: true,
          isActive: true,
          vendor: { select: { id: true, businessName: true, status: true } },
          branch: { select: { id: true, name: true, isActive: true } },
        },
      },
      therapistPackage: { select: { id: true, durationMinutes: true, sellingPrice: true, isActive: true } },
      product: {
        select: {
          id: true,
          name: true,
          image: true,
          imageAlt: true,
          price: true,
          originalPrice: true,
          vendorId: true,
          isActive: true,
          vendor: { select: { id: true, businessName: true, status: true } },
          mediaImages: { orderBy: PRODUCT_IMAGE_ORDER_BY },
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

type CartWithItems = Prisma.CartGetPayload<{ include: typeof CART_INCLUDE }>;

/** Live availability for one cart line, re-derived from the SAME nested fields
 *  `catalog.service.ts`'s `VISIBLE_DEAL_WHERE`/`VISIBLE_PRODUCT_WHERE`/`VISIBLE_THERAPIST_WHERE`
 *  check — a line added before its Member was suspended (or its deal/product/therapist/branch
 *  deactivated since) must read back as unavailable the next time the cart is fetched, not
 *  silently look exactly like it did when it was added. This is a display flag only; checkout
 *  re-validates independently server-side (`order.service.ts`) regardless of what this says. */
function isItemAvailable(item: CartWithItems['items'][number]): boolean {
  if (item.deal) {
    return item.deal.status === 'ACTIVE' && item.deal.approvalStatus === 'APPROVED' && item.deal.vendor.status === 'ACTIVE' && item.deal.branch.isActive && (item.dealPackage?.isActive ?? true);
  }
  if (item.therapist) {
    return item.therapist.isActive && item.therapist.vendor.status === 'ACTIVE' && item.therapist.branch.isActive && (item.therapistPackage?.isActive ?? true);
  }
  if (item.product) {
    return item.product.isActive && item.product.vendor.status === 'ACTIVE';
  }
  return false;
}

function withAvailability(cart: CartWithItems) {
  return { ...cart, items: cart.items.map((item) => ({ ...item, available: isItemAvailable(item) })) };
}

/** Lazily creates an empty cart for the caller if none exists — Cart.customerId is unique, so
 *  this is a plain upsert-by-customerId. customerId is always req.user.sub (route layer). */
export async function getOrCreateCart(customerId: string) {
  const cart = await prisma.cart.upsert({
    where: { customerId },
    update: {},
    create: { customerId },
    include: CART_INCLUDE,
  });
  return withAvailability(cart);
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
 *  (order.service.ts#createOrderFromCart) since CartItem.unitPrice is only provisional.
 *  Mirrors `catalog.service.ts`'s `VISIBLE_DEAL_WHERE` bar (active + approved deal, active
 *  vendor, active branch) — same "regression: only Product checked vendor status, Deal/
 *  Therapist did not" fix as `assertTherapist` below. The `where` below already guarantees
 *  status/approvalStatus/vendor.status/branch.isActive for any row it returns, so (unlike
 *  `assertProduct`, which fetches unconditionally) there is no separate re-check here — mirrors
 *  `assertTherapist` exactly. A re-check used to live here reading `deal.vendor.status`/
 *  `deal.branch.isActive`, but neither relation is selected on this `findFirst`, so it crashed
 *  every time a deal was actually found ("Cannot read properties of undefined (reading
 *  'status')") instead of ever doing anything, since `where` already ruled out the only cases
 *  it was trying to catch. */
async function assertServiceDeal(dealId: string, dealPackageId: string) {
  // A deal the storefront hides (draft, unapproved, member not ACTIVE, branch off) 404s like a missing one.
  const deal = await prisma.deal.findFirst({ where: { id: dealId, ...VISIBLE_DEAL_WHERE } });
  if (!deal) throw new ApiError('NOT_FOUND', 'Deal not found');
  const pkg = await prisma.dealPackage.findUnique({ where: { id: dealPackageId } });
  if (!pkg || pkg.dealId !== deal.id) throw new ApiError('NOT_FOUND', 'Deal package not found');
  if (!pkg.isActive) throw new ApiError('VALIDATION_ERROR', 'Selected package is not currently available');
  return { unitPrice: pkg.sellingPrice };
}

/** Therapist line — `therapistId` + `therapistPackageId`, entirely independent of any Deal (see
 *  Therapist's own schema doc comment — a Deal and a Therapist are always separate cart lines,
 *  never coupled together on one CartItem). Mirrors `catalog.service.ts`'s
 *  `VISIBLE_THERAPIST_WHERE` bar — same vendor/branch-active check `assertProduct` already had
 *  and this one (and `assertServiceDeal`) was missing. */
async function assertTherapist(therapistId: string, therapistPackageId: string) {
  // A therapist the storefront hides (inactive, member not ACTIVE, branch off) 404s like a missing one.
  const therapist = await prisma.therapist.findFirst({ where: { id: therapistId, ...VISIBLE_THERAPIST_WHERE } });
  if (!therapist) throw new ApiError('NOT_FOUND', 'Therapist not found');
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
