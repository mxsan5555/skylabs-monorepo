/**
 * The storefront visibility bars, in a module with no service imports so any service can use
 * them without a cycle (catalog.service.ts imports promotion.service.ts, for one).
 * catalog.service.ts re-exports all three.
 */

/**
 * The one definition of "is this deal visible to a customer / still purchasable": active, its
 * member active, its branch active. No approval step (D6). Used by the catalog list and single-deal
 * lookups, cart add, checkout revalidation and the public promotions read.
 */
export const VISIBLE_DEAL_WHERE = {
  status: 'ACTIVE' as const,
  vendor: { status: 'ACTIVE' as const },
  branch: { isActive: true },
};

/** The same bar for a Product: active product, active member (no branch). */
export const VISIBLE_PRODUCT_WHERE = {
  isActive: true as const,
  vendor: { status: 'ACTIVE' as const },
};

/** The same bar for a Therapist: active therapist at an active member and branch. */
export const VISIBLE_THERAPIST_WHERE = {
  isActive: true,
  vendor: { status: 'ACTIVE' as const },
  branch: { isActive: true },
};
