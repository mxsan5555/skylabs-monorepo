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
  private readonly router = inject(Router);

  protected goToDashboard(): void {
    this.router.navigate(['/account/dashboard']);
  }
}
