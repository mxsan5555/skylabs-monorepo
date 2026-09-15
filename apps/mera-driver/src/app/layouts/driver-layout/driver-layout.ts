import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';

/**
 * Dedicated shell for the driver self-service portal (`/driver/*`) — deliberately
 * NOT `AdminLayout`: no sidebar, no admin nav tree, no RBAC-driven menu. A driver's
 * `bootstrap.permissions` is empty by design (Phase 3A), so this layout's own bottom
 * nav is the only navigation surface, hardcoded to the fixed set of self-service
 * pages rather than driven by the (irrelevant, permission-based) shared menu.
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

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.url.set(cleanUrl(e.urlAfterRedirects)));
  }

  protected isActive(path: string): boolean {
    return path === '/driver' ? this.url() === '/driver' : this.url().startsWith(path);
  }

  protected go(path: string): void {
    this.router.navigateByUrl(path);
  }

  protected signOut(): void {
    this.auth.signOut();
    this.router.navigateByUrl('/sign-in');
  }
}

function cleanUrl(url: string): string {
  return url.split('?')[0].split('#')[0];
}
