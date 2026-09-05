import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthApiService } from '../../core/auth/auth-api.service';

type Method = 'email' | 'phone';

/**
 * Sign-in screen. Choose Email or Phone, enter the destination, and request a
 * one-time code via `POST /auth/otp/request` — then continue to the OTP screen.
 * "Continue with Google" is a full-page redirect to `GET /auth/google`, which
 * mera-driver-api handles end-to-end (consent screen, callback, token issue).
 */
@Component({
  selector: 'md-sign-in',
  templateUrl: './sign-in.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class SignIn {
  private readonly router = inject(Router);
  private readonly authApi = inject(AuthApiService);

  protected readonly method = signal<Method>('phone');
  protected value = '';

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly googleUrl = this.authApi.googleSignInUrl();

  protected onTabChange(event: Event): void {
    const index = (event.target as HTMLElement & { activeTabIndex: number })
      .activeTabIndex;
    this.method.set(index === 1 ? 'phone' : 'email');
  }

  protected sendOtp(): void {
    const identifier = this.value.trim();
    if (!identifier) {
      this.error.set(
        this.method() === 'phone' ? 'Enter your phone number.' : 'Enter your email address.',
      );
      return;
    }

    this.error.set(null);
    this.loading.set(true);
    this.authApi.requestOtp(identifier, 'login').subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/otp'], {
          state: { destination: identifier, method: this.method() },
        });
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not send the code right now. Please try again.');
      },
    });
  }
}
