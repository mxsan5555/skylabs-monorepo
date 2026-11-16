import type { BootstrapResponse } from '@skylabs-monorepo/shared-types';
export type PortalContext = 'customer' | 'driver' | 'staff';
export function portalContext(bootstrap: BootstrapResponse | null): PortalContext | null {
  if (!bootstrap) return null;
  const signed = (bootstrap as BootstrapResponse & {portalContext?: PortalContext}).portalContext;
  if (signed) return signed;
  const roles = bootstrap.roles ?? [];
  if (roles.some(r => r.key === 'customer') || bootstrap.customer) return 'customer';
  if (roles.some(r => r.key === 'driver') || bootstrap.driver) return 'driver';
  return roles.length ? 'staff' : null;
}
export function portalDashboard(bootstrap: BootstrapResponse | null): string {
  const context = portalContext(bootstrap);
  if (context === 'customer') return bootstrap?.customer ? '/customer' : '/unauthorized';
  if (context === 'driver') return bootstrap?.driver ? '/driver' : '/unauthorized';
  if (context === 'staff' && bootstrap) {
    if (bootstrap.permissions.includes('dashboard:view')) return '/account/dashboard';
    const firstRoute = (nodes: BootstrapResponse['menu']): string | undefined => { for(const node of nodes) { if(node.route) return '/account' + node.route; const child=firstRoute(node.children ?? []); if(child) return child; } return undefined; };
    return firstRoute(bootstrap.menu) ?? '/account/profile';
  }
  return '/unauthorized';
}
/** Local URLs only; the matched route's existing permission guard remains authoritative. */
export function authorizedReturn(bootstrap: BootstrapResponse | null, requested: string | null): string {
  const fallback = portalDashboard(bootstrap);
  if (!requested || !requested.startsWith('/') || requested.startsWith('//') || /[\\\x00-\x20]/.test(requested)) return fallback;
  let path: string;
  try { path = decodeURIComponent(requested.split(/[?#]/)[0]); } catch { return fallback; }
  if (/[\\\x00-\x20]/.test(path)) return fallback;
  if (path.startsWith('//') || path.includes('\\') || path.split('/').includes('..')) return fallback;
  const context = portalContext(bootstrap);
  if (context === 'customer' && bootstrap?.customer && (['/customer','/customer/book','/customer/bookings','/customer/payments','/customer/profile','/customer/support','/customer/notifications','/ride/drivers','/ride/payment'].includes(path))) return requested;
  if (context === 'driver' && bootstrap?.driver && ['/driver','/driver/profile','/driver/kyc','/driver/documents','/driver/fee','/driver/availability','/driver/requests','/driver/trips','/driver/earnings','/driver/notifications','/driver/support','/driver/resume'].includes(path)) return requested;
  if (context === 'staff' && /^\/account(?:\/|$)/.test(path)) {
    const allowed = (nodes: BootstrapResponse['menu']): boolean => nodes.some(n => (!!n.route && (path === '/account' + n.route || path.startsWith('/account' + n.route + '/'))) || (n.children ? allowed(n.children) : false));
    const accountsPages=['overview','booking-payments','commissions','driver-payouts','registration-fees','refunds-adjustments','reports'];
    if(bootstrap?.permissions.includes('payments.overview:view') && accountsPages.some(page=>path==='/account/accounts/'+page || path.startsWith('/account/accounts/'+page+'/'))) return requested;
    if (bootstrap && (path === '/account/profile' || allowed(bootstrap.menu))) return requested;
  }
  return fallback;
}
