import type { BootstrapResponse } from '@skylabs-monorepo/shared-types';

/**
 * Post-login routing for msd. Every signed-in user is one of: staff (admin console),
 * customer, vendor, or — the common case, since self-registering as a vendor only adds the
 * `vendor` role on top of the `customer` role every user gets on first login, never removing
 * it (see `ensureVendorRoleAssigned` in msd-api's `vendor.service.ts`) — both at once.
 *
 * Kept app-local (not shared-auth) because the destinations (`/`, `/account/dashboard`,
 * `/choose-experience`) are msd-specific routes.
 */

const STAFF_ROLE_KEYS = ['super_admin', 'admin', 'marketing', 'sales'] as const;

export function getRoleKeys(bootstrap: BootstrapResponse): string[] {
  return bootstrap.roles.map((r) => r.key);
}

export function isStaffUser(bootstrap: BootstrapResponse): boolean {
  const roleKeys = getRoleKeys(bootstrap);
  return roleKeys.some((k) => (STAFF_ROLE_KEYS as readonly string[]).includes(k));
}

export function isCustomerUser(bootstrap: BootstrapResponse): boolean {
  return getRoleKeys(bootstrap).includes('customer');
}

export function isVendorUser(bootstrap: BootstrapResponse): boolean {
  return getRoleKeys(bootstrap).includes('vendor');
}

/** True only for the "holds both, needs to choose" case — never true for staff. */
export function isDualRoleUser(bootstrap: BootstrapResponse): boolean {
  return !isStaffUser(bootstrap) && isCustomerUser(bootstrap) && isVendorUser(bootstrap);
}

/**
 * Where a freshly-signed-in user should land. Staff is unaffected (unchanged behavior);
 * a dual customer+vendor user is sent to the chooser instead of guessing for them.
 */
export function resolvePostLoginPath(bootstrap: BootstrapResponse): string {
  if (isStaffUser(bootstrap)) return '/account/dashboard';
  if (isDualRoleUser(bootstrap)) return '/choose-experience';
  if (isVendorUser(bootstrap)) return '/account/dashboard';
  if (isCustomerUser(bootstrap)) return '/';
  // No recognized role at all (shouldn't happen — every user gets `customer` by default) —
  // fall back to the storefront rather than a blank/guarded page.
  return '/';
}

/** Single-browser-per-OTP-session preference, set by the `/choose-experience` chooser and
 *  read by anything offering a "switch experience" shortcut later in the same session. */
export type ExperienceMode = 'customer' | 'vendor';
const EXPERIENCE_STORAGE_KEY = 'msd_experience_mode';

export function getExperienceMode(): ExperienceMode | null {
  if (typeof localStorage === 'undefined') return null;
  const value = localStorage.getItem(EXPERIENCE_STORAGE_KEY);
  return value === 'customer' || value === 'vendor' ? value : null;
}

export function setExperienceMode(mode: ExperienceMode): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(EXPERIENCE_STORAGE_KEY, mode);
}

/**
 * Post-login "return to where the user came from" — the single place both existing,
 * previously-unwired return-path conventions in this app are read and validated:
 *
 * 1. `?next=<path>` on `/sign-in` — set by every storefront page's own `requireAuthOrRedirect()`
 *    (vendor.tsx, category.tsx, deal-detail.tsx, product-detail.tsx, products.tsx, search.tsx,
 *    therapist-detail.tsx) before an imperative action (Add to Cart, wishlist, etc.).
 * 2. `location.state.from` — set by `shared-auth`'s `<RequireAuth>` route guard (used by
 *    `/cart`, `/wishlist`, `/checkout`, `/my-account/*`, `/account/*`) via React Router's
 *    `<Navigate to="/sign-in" state={{ from: location }} />`.
 *
 * Never a third mechanism — `sign-in.tsx`/`otp.tsx` read whichever of these produced the visit.
 */
export function extractReturnUrl(location: { search?: string; state?: unknown }): string | null {
  const params = new URLSearchParams(location.search ?? '');
  const next = params.get('next');
  if (next) return sanitizeReturnUrl(next);

  const state = location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null | undefined;
  if (state?.from?.pathname) {
    return sanitizeReturnUrl(`${state.from.pathname}${state.from.search ?? ''}${state.from.hash ?? ''}`);
  }
  return null;
}

/** A return URL must be an in-app relative path (never `//host/...` or an absolute
 *  `https://...` URL — that would be an open-redirect) and must never point back into the auth
 *  flow itself (`/sign-in`/`/otp`), or a successful login would bounce straight back to login.
 *  Exported so `otp.tsx` can re-validate a `returnUrl` it received via `location.state` right
 *  before actually navigating to it — defense in depth on top of `extractReturnUrl` already
 *  sanitizing it once, on the way in. */
export function sanitizeReturnUrl(url: string): string | null {
  if (!url || !url.startsWith('/') || url.startsWith('//')) return null;
  if (url === '/sign-in' || url.startsWith('/sign-in?') || url.startsWith('/sign-in/')) return null;
  if (url === '/otp' || url.startsWith('/otp?') || url.startsWith('/otp/')) return null;
  return url;
}

/** Builds the `/sign-in?next=...` URL for an already-known return-path string — used to
 *  re-bounce from `/otp` back to `/sign-in` (the back button, or a direct `/otp` visit missing
 *  its `identifier`) without losing the destination that was already captured. */
export function signInPathWithNext(returnUrl: string | null | undefined): string {
  return returnUrl ? `/sign-in?next=${encodeURIComponent(returnUrl)}` : '/sign-in';
}

/** Builds the same `/sign-in?next=...` URL, but from a `Location`-like object (pathname +
 *  search + hash) instead of an already-known string — the single place every "please sign in
 *  to do X" trigger (header Sign In, a page's own Sign In button, an Add to Cart/wishlist
 *  prompt via `requireAuthOrRedirect`) builds this URL, so the full current route (query
 *  parameters and hash included, never just the bare path) is always captured consistently. */
export function signInPathWithReturnTo(location: { pathname: string; search?: string; hash?: string }): string {
  return signInPathWithNext(`${location.pathname}${location.search ?? ''}${location.hash ?? ''}`);
}
