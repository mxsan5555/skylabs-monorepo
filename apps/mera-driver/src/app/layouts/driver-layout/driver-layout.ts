import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';

export interface DriverNavItem {
  path: string;
  label: string;
  icon: string;
}

/** Every section of the driver portal, in one place — the bottom nav shows the first 5 for
 *  quick thumb access; the drawer (opened from the topbar menu button) shows all of them
 *  plus Logout, so nothing (Vehicle/Trips/Notifications included) is unreachable from
 *  navigation alone. */
export const DRIVER_NAV_ITEMS: DriverNavItem[] = [
  { path: '/driver', label: 'Dashboard', icon: 'home' },
  { path: '/driver/profile', label: 'Profile', icon: 'person' },
  { path: '/driver/kyc', label: 'KYC', icon: 'verified_user' },
  { path: '/driver/documents', label: 'Documents', icon: 'folder' },
  { path: '/driver/vehicle', label: 'My Vehicle', icon: 'directions_car' },
  { path: '/driver/trips', label: 'My Trips', icon: 'route' },
  { path: '/driver/notifications', label: 'Notifications', icon: 'notifications' },
  { path: '/driver/support', label: 'Support', icon: 'support_agent' },
];

/**
 * Dedicated shell for the driver self-service portal (`/driver/*`) — deliberately
 * NOT `AdminLayout`: no sidebar, no admin nav tree, no RBAC-driven menu. A driver's
 * `bootstrap.permissions` is empty by design (Phase 3A), so this layout's own nav
 * (bottom bar + drawer) is the only navigation surface, hardcoded to the fixed set of
 * self-service pages rather than driven by the (irrelevant, permission-based) shared menu.
 */
@Component({
  selector: 'md-driver-layout',
  imports: [RouterOutlet],
  templateUrl: './driver-layout.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DriverLayout {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  protected readonly url = signal(cleanUrl(this.router.url));
  protected readonly navOpen = signal(false);
  protected readonly navItems = DRIVER_NAV_ITEMS;

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.url.set(cleanUrl(e.urlAfterRedirects));
        this.navOpen.set(false);
      });
  }

  protected isActive(path: string): boolean {
    return path === '/driver' ? this.url() === '/driver' : this.url().startsWith(path);
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
