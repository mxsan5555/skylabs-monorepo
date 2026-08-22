import { Prisma } from '../generated/prisma-client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { PUBLIC_DEAL_SELECT, VISIBLE_DEAL_WHERE } from './catalog.service';

/**
 * Customer wishlist ("saved for later") — self-service only, gated on `authenticate` alone (no
 * `requirePermission`), exactly like Cart/Booking. `customerId` is always `req.user.sub`, never a
 * param/body value (route layer). Unlike Cart, a wishlisted deal can be either a service or a
 * product — there's no purchase-type restriction here, it's just a saved-items list.
 */

const WISHLIST_ITEM_SELECT = {
  id: true,
  dealId: true,
  createdAt: true,
  deal: { select: PUBLIC_DEAL_SELECT },
} as const;

/**
 * The caller's wishlist — items whose Deal has since gone inactive/rejected/vendor-suspended are
 * filtered out here (not deleted) by folding `VISIBLE_DEAL_WHERE` into the query's `where`, the
 * same "never show what's no longer real/purchasable" rule `catalog.service.ts` enforces for the
 * public storefront. The underlying row is left alone so it reappears automatically if the deal
 * becomes visible again — the customer's saved intent isn't silently lost.
 */
export async function listWishlist(customerId: string) {
  return prisma.wishlistItem.findMany({
    where: { customerId, deal: VISIBLE_DEAL_WHERE },
    orderBy: { createdAt: 'desc' },
    select: WISHLIST_ITEM_SELECT,
  });
}

/** 404s (not a leakier error) for a missing OR currently-hidden deal — never confirms whether a
 *  hidden deal id exists, matching `catalog.service.ts#getPublicDealOrThrow`'s convention. */
async function assertVisibleDeal(dealId: string) {
  const deal = await prisma.deal.findFirst({ where: { id: dealId, ...VISIBLE_DEAL_WHERE } });
  if (!deal) throw new ApiError('NOT_FOUND', 'Deal not found');
  return deal;
}

/**
 * Adds a deal to the caller's wishlist. Idempotent: wishlisting an already-saved deal returns the
 * existing item rather than erroring — checked via `findUnique` first, and the P2002 unique-
 * constraint case (a concurrent duplicate add) is caught as a fallback and treated the same way,
 * so the client never sees a raw DB conflict for what is, from its point of view, a no-op.
 */
export async function addItem(customerId: string, dealId: string) {
  await assertVisibleDeal(dealId);

  const existing = await prisma.wishlistItem.findUnique({
    where: { customerId_dealId: { customerId, dealId } },
  });
  if (existing) {
    return prisma.wishlistItem.findUniqueOrThrow({ where: { id: existing.id }, select: WISHLIST_ITEM_SELECT });
  }

  try {
    const created = await prisma.wishlistItem.create({ data: { customerId, dealId } });
    return prisma.wishlistItem.findUniqueOrThrow({ where: { id: created.id }, select: WISHLIST_ITEM_SELECT });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const race = await prisma.wishlistItem.findUniqueOrThrow({
        where: { customerId_dealId: { customerId, dealId } },
        select: WISHLIST_ITEM_SELECT,
      });
      return race;
    }
    throw err;
  }
}

/** Scoped by `where: { customerId, dealId }` — a delete for a dealId the caller never wishlisted,
 *  or that belongs to another customer's wishlist item, matches zero rows and 404s without ever
 *  touching another customer's row (no separate ownership lookup needed, unlike Cart's item-id
 *  form, because customerId+dealId together already are the ownership scope). */
export async function removeItem(customerId: string, dealId: string): Promise<void> {
  const { count } = await prisma.wishlistItem.deleteMany({ where: { customerId, dealId } });
  if (count === 0) throw new ApiError('NOT_FOUND', 'Wishlist item not found');
}

export async function checkWishlisted(customerId: string, dealId: string): Promise<{ wishlisted: boolean }> {
  const item = await prisma.wishlistItem.findUnique({ where: { customerId_dealId: { customerId, dealId } } });
  return { wishlisted: !!item };
}
