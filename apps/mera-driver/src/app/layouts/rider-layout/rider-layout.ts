import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

/**
 * Full-bleed, mobile-first shell for the rider booking flow (home + ride/*).
 * No marketing header/footer — just the routed screen and a bottom nav. The nav
 * only shows on the home screen; the deeper booking steps are immersive (their
 * own back button + sticky CTA), matching the Uber/Lyft reference.
 */
@Component({
  selector: 'md-rider-layout',
  imports: [RouterOutlet],
  templateUrl: './rider-layout.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class RiderLayout {
  private readonly router = inject(Router);

  /** Current URL without query/hash, tracked for nav visibility + active state. */
  protected readonly url = signal(cleanUrl(this.router.url));

  /** The immersive booking steps hide the bottom nav (only the /ride home shows it). */
  protected readonly showNav = () => this.url() === '/ride';

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.url.set(cleanUrl(e.urlAfterRedirects)));
  }

  protected isActive(path: string): boolean {
    const u = this.url();
    return path === '/ride' ? u === '/ride' : u.startsWith(path);
  }

  protected go(path: string): void {
    this.router.navigateByUrl(path);
  }
}

function cleanUrl(url: string): string {
  return url.split('?')[0].split('#')[0];
}
