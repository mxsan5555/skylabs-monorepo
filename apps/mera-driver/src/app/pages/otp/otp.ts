import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';
import { AuthApiService } from '../../core/auth/auth-api.service';

const RESEND_SECONDS = 24;

/**
 * OTP screen. Shows where the code was sent, takes the 6-digit code, and on
 * verify calls `POST /auth/otp/verify`, then hands the access token to the
 * shared `AuthService.signIn()` (which fetches `/rbac/bootstrap` before
 * resolving) and lands on the dashboard. Includes a resend countdown that
 * re-requests a fresh OTP.
 */
@Component({
  selector: 'md-otp',
  templateUrl: './otp.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Otp implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly authApi = inject(AuthApiService);

  protected readonly destination =
    (history.state as { destination?: string; method?: string } | null)?.destination ?? '';
  protected readonly method =
    (history.state as { destination?: string; method?: 'email' | 'phone' } | null)?.method ?? 'phone';

  protected code = '';
  protected readonly seconds = signal(RESEND_SECONDS);
  protected readonly verifying = signal(false);
  protected readonly error = signal<string | null>(null);

  private timer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    if (!this.destination) {
      this.router.navigate(['/sign-in']);
      return;
    }
    this.timer = setInterval(() => {
      const s = this.seconds();
      if (s > 0) this.seconds.set(s - 1);
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  protected verify(): void {
    if (this.code.length !== 6) {
      this.error.set('Enter the 6-digit code.');
      return;
    }

    this.error.set(null);
    this.verifying.set(true);
    this.authApi.verifyOtp(this.destination, this.code, 'login').subscribe({
      next: async (result) => {
        await this.auth.signIn(result.accessToken);
        this.verifying.set(false);
        this.router.navigate(['/account/dashboard']);
      },
      error: () => {
        this.verifying.set(false);
        this.error.set('That code didn’t work. Check it and try again.');
      },
    });
  }

  protected resend(): void {
    this.authApi.requestOtp(this.destination, 'login').subscribe();
    this.seconds.set(RESEND_SECONDS);
  }

  protected back(): void {
    this.router.navigate(['/sign-in']);
  }
}
