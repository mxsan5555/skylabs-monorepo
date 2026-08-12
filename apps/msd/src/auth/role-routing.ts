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
