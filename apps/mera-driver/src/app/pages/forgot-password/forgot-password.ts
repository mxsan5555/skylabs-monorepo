import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthApiService } from '../../core/auth/auth-api.service';

/**
 * Requests a password-reset code (reuses the same OTP delivery as sign-in, purpose
 * `password_reset` server-side) and hands off to the reset-password screen to enter it.
 */
@Component({
  selector: 'md-forgot-password',
  templateUrl: './forgot-password.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ForgotPassword {
  private readonly router = inject(Router);
  private readonly authApi = inject(AuthApiService);

  protected value = (history.state as { destination?: string } | null)?.destination ?? '';
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(false);

  protected onInput(val: string): void {
    this.value = val;
    this.error.set(null);
  }

  protected sendResetCode(): void {
    const identifier = this.value.trim();
    if (!identifier) {
      this.error.set('Enter your email or phone number.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.authApi.forgotPassword(identifier).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/reset-password'], { state: { destination: identifier } });
      },
      error: () => {
        this.loading.set(false);
        // Same anti-enumeration posture as the backend: don't reveal whether the identifier
        // exists — proceed to the reset screen regardless.
        this.router.navigate(['/reset-password'], { state: { destination: identifier } });
      },
    });
  }

  protected back(): void {
    this.router.navigate(['/sign-in']);
  }
}
