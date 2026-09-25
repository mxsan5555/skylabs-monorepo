import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';

export interface CustomerNavItem {
  path: string;
  label: string;
  icon: string;
}

/** Every section of the customer portal, in one place — same bottom-nav-plus-drawer
 *  structure as `DRIVER_NAV_ITEMS`. Only the real, backed modules are listed (Notifications
 *  is a "coming soon" page, not a fake data screen) — no Vehicles/Documents/Payments, since
 *  none of those have real customer-facing functionality in this codebase today. */
export const CUSTOMER_NAV_ITEMS: CustomerNavItem[] = [
  { path: '/customer', label: 'Dashboard', icon: 'home' },
  { path: '/customer/profile', label: 'My Profile', icon: 'person' },
  { path: '/customer/bookings', label: 'My Bookings', icon: 'book_online' },
  { path: '/customer/notifications', label: 'Notifications', icon: 'notifications' },
  { path: '/customer/support', label: 'Support', icon: 'support_agent' },
];

/**
 * Dedicated shell for the customer self-service portal (`/customer/*`) — deliberately NOT
 * `AdminLayout`: no sidebar, no admin nav tree, no RBAC-driven menu. Mirrors `DriverLayout`
 * exactly (same reasoning: a customer's `bootstrap.permissions` is empty by design, so this
 * layout's own nav is the only navigation surface) — reuses the exact same CSS classes
 * (`.driver-shell`/`.driver-topbar`/`.rider-nav`/etc. in `styles.css`), since they're already
 * generic, presentational shell styles with nothing driver-specific baked in.
 */
@Component({
  selector: 'md-customer-layout',
  imports: [RouterOutlet],
  templateUrl: './customer-layout.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class CustomerLayout {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  protected readonly url = signal(cleanUrl(this.router.url));
  protected readonly navOpen = signal(false);
  protected readonly navItems = CUSTOMER_NAV_ITEMS;

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.url.set(cleanUrl(e.urlAfterRedirects));
        this.navOpen.set(false);
      });
  }

  protected isActive(path: string): boolean {
    return path === '/customer' ? this.url() === '/customer' : this.url().startsWith(path);
  }

  protected go(path: string): void {
    this.router.navigateByUrl(path);
  }

  protected toggleNav(): void {
    this.navOpen.update((v) => !v);
  }

  protected closeNav(): void {
    this.navOpen.set(false);
  }

  protected signOut(): void {
    this.navOpen.set(false);
    this.auth.signOut();
    this.router.navigateByUrl('/sign-in');
  }
}

function cleanUrl(url: string): string {
  return url.split('?')[0].split('#')[0];
}
