import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { HttpClient } from '@angular/common/http';
import layoutDefaults from '../../../../public/data/layout.json';

/**
 * App header: brand, primary nav, and auth action. App-specific (it knows the
 * router and auth), so it lives in the app, not in shared-ui. Uses Material Web
 * buttons, hence CUSTOM_ELEMENTS_SCHEMA.
 */
@Component({
  selector: 'md-header',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './header.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: {
    'class': 'block sticky top-0 z-20'
  }
})
export class Header implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);

  /** Profile dropdown menu state. */
  protected readonly profileMenuOpen = signal(false);

  /** Services dropdown menu state. */
  protected readonly servicesMenuOpen = signal(false);

  /** Hover timeout helper for hover-to-open logic */
  private hoverTimeout: any;
  /** Hover timeout helper for profile hover-to-open logic */
  private profileHoverTimeout: any;

  protected onMouseEnter(): void {
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
    this.servicesMenuOpen.set(true);
  }

  protected onMouseLeave(): void {
    this.hoverTimeout = setTimeout(() => {
      this.servicesMenuOpen.set(false);
    }, 150);
  }

  protected toggleServicesMenu(event: Event): void {
    event.stopPropagation();
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
    this.servicesMenuOpen.update(v => !v);
  }

  protected onProfileMouseEnter(): void {
    if (this.profileHoverTimeout) {
      clearTimeout(this.profileHoverTimeout);
      this.profileHoverTimeout = null;
    }
    this.profileMenuOpen.set(true);
  }

  protected onProfileMouseLeave(): void {
    this.profileHoverTimeout = setTimeout(() => {
      this.profileMenuOpen.set(false);
    }, 150);
  }

  protected toggleProfileMenu(event: Event): void {
    event.stopPropagation();
    if (this.profileHoverTimeout) {
      clearTimeout(this.profileHoverTimeout);
      this.profileHoverTimeout = null;
    }
    this.profileMenuOpen.update(v => !v);
  }

  /** Mobile navigation menu state. */
  protected readonly mobileMenuOpen = signal(false);

  /** Dynamic Copy Signals initialized as empty */
  protected readonly isLoading = signal<boolean>(true);
  protected readonly brandName = signal<string>('');
  protected readonly driversOnlineCount = signal<number>(0);
  protected readonly driversOnlineLabel = signal<string>('');
  protected readonly helplineLabel = signal<string>('');
  protected readonly helplineNumber = signal<string>('');
  protected readonly navLinks = signal<any[]>([]);

  ngOnInit(): void {
    this.http.get<any>('/data/layout.json').subscribe({
      next: (data) => {
        if (data?.header) {
          const h = data.header;
          const d = layoutDefaults.header;
          this.brandName.set(h.brand || d.brand);
          this.driversOnlineCount.set(h.driversOnlineCount !== undefined ? h.driversOnlineCount : d.driversOnlineCount);
          this.driversOnlineLabel.set(h.driversOnlineLabel || d.driversOnlineLabel);
          this.helplineLabel.set(h.helplineLabel || d.helplineLabel);
          this.helplineNumber.set(h.helplineNumber || d.helplineNumber);
          this.navLinks.set(h.navLinks || d.navLinks);
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load header layouts from json', err);
        const h = layoutDefaults.header;
        this.brandName.set(h.brand);
        this.driversOnlineCount.set(h.driversOnlineCount);
        this.driversOnlineLabel.set(h.driversOnlineLabel);
        this.helplineLabel.set(h.helplineLabel);
        this.helplineNumber.set(h.helplineNumber);
        this.navLinks.set(h.navLinks);
        this.isLoading.set(false);
      }
    });
  }

  protected onNavigate(route: string): void {
    this.mobileMenuOpen.set(false);
    this.router.navigate([route]);
  }

  protected goSignIn(): void {
    this.router.navigate(['/sign-in']);
  }

  protected goAccount(): void {
    this.router.navigate(['/account']);
  }

  protected goDashboard(): void {
    this.router.navigate(['/account/dashboard']);
  }

  protected callHelpline(): void {
    window.location.href = `tel:${this.helplineNumber()}`;
  }
}
