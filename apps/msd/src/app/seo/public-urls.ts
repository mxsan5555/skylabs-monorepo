/**
 * Centralized canonical public URL construction — every link generator (home cards/sliders,
 * search, category nav, related items, breadcrumbs, cart, share/copy-link, admin "View on
 * website") should build a Deal/Product/Therapist/Vendor/Category path through these functions
 * rather than hand-rolling `/deal/${id}` etc., so they can never drift onto the legacy
 * UUID-based shape. Falls back to `id` only for a row that somehow has no `slug` yet (shouldn't
 * happen for any row created after the SEO-slug migration/backfill) — never throws, never
 * invents a slug client-side.
 */

export function dealPath(deal: { id: string; slug?: string | null }): string {
  return `/deal/${deal.slug || deal.id}`;
}

/** Plural `/products/:slug` — matches this app's existing route prefix (`/products` is also the
 *  listing page); there is no singular `/product/` route to preserve/invent. */
export function productPath(product: { id: string; slug?: string | null }): string {
  return `/products/${product.slug || product.id}`;
}

export function therapistPath(therapist: { id: string; slug?: string | null }): string {
  return `/therapist/${therapist.slug || therapist.id}`;
}

export function vendorPath(vendor: { id: string; slug?: string | null }): string {
  return vendor.slug ? `/vendor/${vendor.slug}` : `/vendor/${vendor.id}`;
}

// Category links already have a centralized builder — `categoryHref`/`cityHref` in
// `catalog/catalog-shell.tsx` — reused directly rather than duplicated here.
