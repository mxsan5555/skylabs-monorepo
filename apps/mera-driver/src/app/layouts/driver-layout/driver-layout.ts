import { Component, CUSTOM_ELEMENTS_SCHEMA, HostListener, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';
import { DriverSidebar } from './driver-sidebar';

export interface DriverNavItem {
  path: string;
  label: string;
  icon: string;
}

/** Every section of the driver portal, in one place — the bottom nav (mobile only) shows
 *  the first 5 for quick thumb access; the sidebar (persistent on desktop, a drawer on
 *  mobile, opened from the topbar menu button) shows all of them plus Logout, so nothing
 *  is unreachable from navigation alone. */
export const DRIVER_NAV_ITEMS: DriverNavItem[] = [
  { path: '/driver', label: 'Dashboard', icon: 'home' },
  { path: '/driver/profile', label: 'My Profile', icon: 'person' },
  { path: '/driver/kyc', label: 'KYC & Documents', icon: 'verified_user' },
  { path: '/driver/fee', label: 'Registration Fee', icon: 'payments' },
  { path: '/driver/availability', label: 'Availability', icon: 'toggle_on' },
  { path: '/driver/requests', label: 'Trip Requests', icon: 'notifications_active' },
  { path: '/driver/trips', label: 'My Trips', icon: 'route' },
  { path: '/driver/earnings', label: 'Earnings', icon: 'account_balance_wallet' },
  { path: '/driver/notifications', label: 'Notifications', icon: 'notifications' },
  { path: '/driver/support', label: 'Help & Support', icon: 'support_agent' },
];

/**
 * Shell for the driver self-service portal (`/driver/*`): a persistent sidebar on
 * desktop and a collapsible drawer on mobile, reusing the exact `.admin-layout`
 * grid/breakpoint mechanism the admin console uses (`layouts/admin-layout`) — that
 * shell is already documented as "reused for every role," so the driver portal gets
 * a real sidebar + full-width content without a second layout system. No RBAC-driven
 * menu: a driver's `bootstrap.permissions` is empty by design, so navigation is the
 * fixed `DRIVER_NAV_ITEMS` set rather than the (irrelevant) shared permission menu.
 * The mobile bottom tab bar is kept alongside the drawer for quick thumb access.
 */
@Component({
  selector: 'md-driver-layout',
  imports: [RouterOutlet, DriverSidebar],
  templateUrl: './driver-layout.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DriverLayout {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  protected readonly url = signal(cleanUrl(this.router.url));
  protected readonly navItems = DRIVER_NAV_ITEMS;

  protected readonly collapsed = signal(typeof window !== 'undefined' && window.innerWidth < 768);
  private readonly viewportWidth = signal(typeof window !== 'undefined' ? window.innerWidth : 1200);
  protected readonly mobileMenuOpen = computed(() => this.viewportWidth() < 768 && !this.collapsed());

  @HostListener('window:resize') onResize(): void {
    const before = this.viewportWidth();
    this.viewportWidth.set(window.innerWidth);
    if (before >= 768 && window.innerWidth < 768) this.collapsed.set(true);
    if (before < 768 && window.innerWidth >= 768) this.collapsed.set(false);
  }

  protected readonly currentLabel = computed(
    () => this.navItems.find((item) => this.isActive(item.path))?.label,
  );

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe((e) => {
        this.url.set(cleanUrl(e.urlAfterRedirects));
        if (this.viewportWidth() < 768) this.collapsed.set(true);
      });
  }

  protected isActive(path: string): boolean {
    return path === '/driver' ? this.url() === '/driver' : this.url().startsWith(path);
  }

  protected go(path: string): void {
    this.router.navigateByUrl(path);
  }

  protected toggleSidebar(): void {
    this.collapsed.update((v) => !v);
  }

  protected closeSidebar(): void {
    this.collapsed.set(true);
  }

  protected signOut(): void {
    this.auth.signOut();
    this.router.navigateByUrl('/sign-in');
  }
}

function cleanUrl(url: string): string {
  return url.split('?')[0].split('#')[0];
}
