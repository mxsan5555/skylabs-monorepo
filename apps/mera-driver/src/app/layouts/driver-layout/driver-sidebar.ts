import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject, input, output, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';
import { DRIVER_NAV_ITEMS } from './driver-layout';

/**
 * Driver-portal sidebar: a fixed set of 10 self-service sections (no RBAC menu —
 * a driver's `bootstrap.permissions` is empty by design) rendered with the same
 * `.admin-sidebar`/`.admin-nav-item` shell classes the admin console sidebar uses
 * (`admin/sidebar/sidebar.ts`), so the two look and behave identically without a
 * second design system. Footer shows driver identity instead of roles.
 */
@Component({
  selector: 'md-driver-sidebar',
  imports: [RouterLink],
  templateUrl: './driver-sidebar.html',
  styles: ':host { display: contents; }',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DriverSidebar {
  readonly open = input(true);
  readonly close = output<void>();
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly navItems = DRIVER_NAV_ITEMS;

  protected readonly currentUrl = signal(cleanUrl(this.router.url));

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe((e) => this.currentUrl.set(cleanUrl(e.urlAfterRedirects)));
  }

  protected readonly driver = computed(() => this.auth.bootstrap()?.driver);

  protected readonly driverName = computed(() => {
    const d = this.driver();
    return d ? [d.firstName, d.lastName].filter(Boolean).join(' ') : 'Loading…';
  });

  protected readonly driverIdShort = computed(() => {
    const id = this.driver()?.id;
    return id ? id.slice(0, 8).toUpperCase() : '';
  });

  protected readonly initial = computed(() => (this.driverName().charAt(0) || '?').toUpperCase());

  protected isActive(path: string): boolean {
    return path === '/driver' ? this.currentUrl() === '/driver' : this.currentUrl().startsWith(path);
  }

  protected signOut(): void {
    this.auth.signOut();
    this.router.navigateByUrl('/sign-in');
  }
}

function cleanUrl(url: string): string {
  return url.split('?')[0].split('#')[0];
}
