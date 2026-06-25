import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

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
})
export class Header {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Profile dropdown menu state. */
  protected readonly profileMenuOpen = signal(false);

  protected goSignIn(): void {
    this.router.navigate(['/sign-in']);
  }

  protected goAccount(): void {
    this.router.navigate(['/account']);
  }

  protected goDashboard(): void {
    this.router.navigate(['/account/dashboard']);
  }
}
