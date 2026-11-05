import { AuthService } from '@skylabs-monorepo/shared-auth/angular';
import { portalContext, portalDashboard } from '../../core/auth/portal-routing';
import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { Router } from '@angular/router';

/** 403 page. `permissionGuard` sends a denied navigation here (see `app.config.ts`'s
 *  `unauthorizedRedirectPath`) instead of the previous silent redirect to Profile. */
@Component({
  selector: 'md-unauthorized',
  templateUrl: './unauthorized.html',
  styleUrl: '../not-found/not-found.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Unauthorized {
  protected readonly auth = inject(AuthService);
  protected missingLink(): string | null {
    const b = this.auth.bootstrap(); const context = portalContext(b);
    if(context === 'customer' && !b?.customer) return 'Your customer account is not linked to a Customer record. Contact support to link your account.';
    if(context === 'driver' && !b?.driver) return 'Your driver account is not linked to a Driver record. Contact authorized staff to link your account.';
    return null;
  }
  private readonly router = inject(Router);

  protected goToDashboard(): void {
    this.router.navigateByUrl(portalDashboard(this.auth.bootstrap()));
  }
}
