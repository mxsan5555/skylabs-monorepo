import {
  apiGet,
  apiPost,
  apiDelete,
} from './rbac/client';

import type {
  CatalogDeal,
} from './catalog';

export interface WishlistProduct {
  id: string;
  name: string;
  slug: string;
  brand: string | null;

  image: string | null;
  imageAlt: string | null;
  mediaImages?: Array<{
    storageKey: string;
    isPrimary: boolean;
    sortOrder: number;
  }>;

  price: string | number;
  originalPrice: string | number | null;
  discount: number | null;

  isNew: boolean;
  isFeatured: boolean;
  isActive: boolean;

  vendor?: {
    id: string;
    businessName: string;
    slug: string | null;
  } | null;
}

export interface WishlistItem {
  id: string;

  customerId: string;

  dealId: string | null;
  productId: string | null;

  createdAt: string;

  deal: CatalogDeal | null;
  product: WishlistProduct | null;
}

/**
 * Get complete wishlist.
 */
export function getWishlist(
  token: string | null,
) {
  return apiGet<WishlistItem[]>(
    '/wishlist',
    token,
  );
}

/**
 * Add Deal to wishlist.
 */
export function addToWishlist(
  token: string | null,
  dealId: string,
) {
  return apiPost<WishlistItem>(
    '/wishlist',
    token,
    {
      dealId,
    },
  );
}

/**
 * Add Product to wishlist.
 */
export function addProductToWishlist(
  token: string | null,
  productId: string,
) {
  return apiPost<WishlistItem>(
    '/wishlist',
    token,
    {
      productId,
    },
  );
}

/**
 * Remove Deal from wishlist.
 */
export function removeFromWishlist(
  token: string | null,
  dealId: string,
) {
  return apiDelete<{ removed: boolean }>(
    `/wishlist/${dealId}`,
    token,
  );
}

/**
 * Remove Product from wishlist.
 */
export function removeProductFromWishlist(
  token: string | null,
  productId: string,
) {
  return apiDelete<{ removed: boolean }>(
    `/wishlist/product/${productId}`,
    token,
  );
}

/**
 * Check Deal wishlist status.
 */
export function checkWishlisted(
  token: string | null,
  dealId: string,
) {
  return apiGet<{ wishlisted: boolean }>(
    `/wishlist/check/${dealId}`,
    token,
  );
}

/**
 * Check Product wishlist status.
 */
export function checkProductWishlisted(
  token: string | null,
  productId: string,
) {
  return apiGet<{ wishlisted: boolean }>(
    `/wishlist/check/product/${productId}`,
    token,
  );
}