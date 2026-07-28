import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ApiClient } from '../../core/api/api-client.service';
import type { User, UserRole } from '../../models';

/**
 * Lands here after the Google OAuth redirect from mera-driver-api
 * (`/auth/google/callback`). Trades the one-time `code` query param for a
 * real JWT via `/auth/exchange` — the JWT itself never travels in a URL.
 */
@Component({
  selector: 'md-auth-callback',
  templateUrl: './auth-callback.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AuthCallback implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiClient);

  protected readonly error = signal(false);

  ngOnInit(): void {
    const code = this.route.snapshot.queryParamMap.get('code');
    if (!code) {
      this.error.set(true);
      return;
    }

    this.api
      .post<{ token: string; roles: UserRole[]; user: User }>('/auth/exchange', { code })
      .subscribe({
        next: (result) => {
          this.auth.signIn(result.token, result.roles, result.user);
          this.router.navigate(['/'], { replaceUrl: true });
        },
        error: () => this.error.set(true),
      });
  }

  protected backToSignIn(): void {
    this.router.navigate(['/sign-in']);
  }
}
