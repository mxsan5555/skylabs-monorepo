import { Prisma } from '../generated/prisma-client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import {
  PUBLIC_DEAL_SELECT,
  VISIBLE_DEAL_WHERE,
} from './catalog.service';

/**
 * Customer wishlist.
 *
 * A wishlist item represents exactly one catalog entity:
 * - Deal
 * - Product
 *
 * customerId always comes from req.user.sub.
 */

const WISHLIST_ITEM_SELECT = {
  id: true,
  customerId: true,
  dealId: true,
  productId: true,
  createdAt: true,

  deal: {
    select: PUBLIC_DEAL_SELECT,
  },

  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      brand: true,
      image: true,
      imageAlt: true,
      mediaImages: {
        select: {
          storageKey: true,
          isPrimary: true,
          sortOrder: true,
        },
      },
      price: true,
      originalPrice: true,
      discount: true,
      isNew: true,
      isFeatured: true,
      isActive: true,

      vendor: {
        select: {
          id: true,
          businessName: true,
          slug: true,
        },
      },
    },
  },
} as const;

/**
 * Returns the customer's wishlist.
 *
 * Deals are filtered using the same visibility rules
 * used by the public catalog.
 *
 * Products are shown only while isActive = true.
 */
export async function listWishlist(customerId: string) {
  return prisma.wishlistItem.findMany({
    where: {
      customerId,

      OR: [
        {
          deal: VISIBLE_DEAL_WHERE,
        },
        {
          product: {
            isActive: true,
          },
        },
      ],
    },

    orderBy: {
      createdAt: 'desc',
    },

    select: WISHLIST_ITEM_SELECT,
  });
}

/**
 * Makes sure the Deal exists and is currently visible.
 */
async function assertVisibleDeal(dealId: string) {
  const deal = await prisma.deal.findFirst({
    where: {
      id: dealId,
      ...VISIBLE_DEAL_WHERE,
    },
  });

  if (!deal) {
    throw new ApiError('NOT_FOUND', 'Deal not found');
  }

  return deal;
}

/**
 * Makes sure the Product exists and is currently active.
 */
async function assertVisibleProduct(productId: string) {
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      isActive: true,
    },
  });

  if (!product) {
    throw new ApiError('NOT_FOUND', 'Product not found');
  }

  return product;
}

/**
 * Add Deal to wishlist.
 *
 * Idempotent:
 * if the Deal is already present, the existing wishlist item
 * is returned.
 */
export async function addItem(
  customerId: string,
  dealId: string,
) {
  await assertVisibleDeal(dealId);

  const existing = await prisma.wishlistItem.findUnique({
    where: {
      customerId_dealId: {
        customerId,
        dealId,
      },
    },
  });

  if (existing) {
    return prisma.wishlistItem.findUniqueOrThrow({
      where: {
        id: existing.id,
      },
      select: WISHLIST_ITEM_SELECT,
    });
  }

  try {
    const created = await prisma.wishlistItem.create({
      data: {
        customerId,
        dealId,
      },
    });

    return prisma.wishlistItem.findUniqueOrThrow({
      where: {
        id: created.id,
      },
      select: WISHLIST_ITEM_SELECT,
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      const race = await prisma.wishlistItem.findUniqueOrThrow({
        where: {
          customerId_dealId: {
            customerId,
            dealId,
          },
        },
        select: WISHLIST_ITEM_SELECT,
      });

      return race;
    }

    throw err;
  }
}

/*
  Add Product to wishlist.
 Idempotent:
  if the Product is already present, the existing wishlist item
  is returned.
 */

export async function addProductItem(
  customerId: string,
  productId: string,
) {
  await assertVisibleProduct(productId);

  const existing = await prisma.wishlistItem.findUnique({
    where: {
      customerId_productId: {
        customerId,
        productId,
      },
    },
  });

  if (existing) {
    return prisma.wishlistItem.findUniqueOrThrow({
      where: {
        id: existing.id,
      },
      select: WISHLIST_ITEM_SELECT,
    });
  }

  try {
    const created = await prisma.wishlistItem.create({
      data: {
        customerId,
        productId,
      },
    });

    return prisma.wishlistItem.findUniqueOrThrow({
      where: {
        id: created.id,
      },
      select: WISHLIST_ITEM_SELECT,
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      const race = await prisma.wishlistItem.findUniqueOrThrow({
        where: {
          customerId_productId: {
            customerId,
            productId,
          },
        },
        select: WISHLIST_ITEM_SELECT,
      });

      return race;
    }

    throw err;
  }
}


//  Remove a Deal from the caller's wishlist.

export async function removeItem(
  customerId: string,
  dealId: string,
): Promise<void> {
  const { count } = await prisma.wishlistItem.deleteMany({
    where: {
      customerId,
      dealId,
    },
  });

  if (count === 0) {
    throw new ApiError(
      'NOT_FOUND',
      'Wishlist item not found',
    );
  }
}


// Remove a Product from the caller's wishlist.
 
export async function removeProductItem(
  customerId: string,
  productId: string,
): Promise<void> {
  const { count } = await prisma.wishlistItem.deleteMany({
    where: {
      customerId,
      productId,
    },
  });

  if (count === 0) {
    throw new ApiError(
      'NOT_FOUND',
      'Wishlist item not found',
    );
  }
}


//  Check whether a Deal is wishlisted.

export async function checkWishlisted(
  customerId: string,
  dealId: string,
): Promise<{ wishlisted: boolean }> {
  const item = await prisma.wishlistItem.findUnique({
    where: {
      customerId_dealId: {
        customerId,
        dealId,
      },
    },
  });

  return {
    wishlisted: !!item,
  };
}


//  Check whether a Product is wishlisted.

export async function checkProductWishlisted(
  customerId: string,
  productId: string,
): Promise<{ wishlisted: boolean }> {
  const item = await prisma.wishlistItem.findUnique({
    where: {
      customerId_productId: {
        customerId,
        productId,
      },
    },
  });

  return {
    wishlisted: !!item,
  };
}