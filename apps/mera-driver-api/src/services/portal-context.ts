import { HttpError } from '../middleware/errorHandler';
export type PortalContext = 'customer' | 'driver' | 'staff';
export const isPortalRole = (key: string) => key === 'customer' || key === 'driver';
/** A requested context selects existing access; it never grants a role. */
export function selectPortalContext(roles: readonly string[], requested?: PortalContext | null): PortalContext {
  const fallback = roles.includes('customer') ? 'customer' : roles.includes('driver') ? 'driver' : 'staff';
  const context = requested ?? fallback;
  const allowed = context === 'staff' ? roles.some(key => !isPortalRole(key)) : roles.includes(context);
  // A staff-only login from the website still enters its permitted staff area.
  if (!allowed && requested && !roles.some(isPortalRole) && roles.length) return 'staff';
  if (!allowed) throw new HttpError(403, 'PORTAL_ACCESS_DENIED', 'This account does not have access to the requested portal.');
  return context;
}
export function contextRoleKeys(roles: readonly string[], context: PortalContext): string[] {
  return roles.filter(key => context === 'staff' ? !isPortalRole(key) : key === context);
}
