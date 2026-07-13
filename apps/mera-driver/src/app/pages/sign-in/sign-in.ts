import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiClient, ApiError } from '../../core/api/api-client.service';
import { environment } from '../../../environments/environment';

type Method = 'email' | 'phone';

/**
 * Sign-in screen. Choose Email or Phone, enter the destination, and request a
 * one-time code — then continue to the OTP screen. Layout follows the design
 * reference; colors come from mera-driver's M3 theme.
 */
@Component({
  selector: 'md-sign-in',
  templateUrl: './sign-in.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class SignIn {
  private readonly router = inject(Router);
  private readonly api = inject(ApiClient);

  protected readonly method = signal<Method>('phone');
  protected value = '';
  protected readonly error = signal<string | null>(null);
  protected readonly pending = signal(false);

  protected onTabChange(event: Event): void {
    const index = (event.target as HTMLElement & { activeTabIndex: number })
      .activeTabIndex;
    this.method.set(index === 1 ? 'phone' : 'email');
    this.error.set(null);
  }

  protected sendOtp(): void {
    if (this.pending()) return;
    this.error.set(null);

    if (!this.value.trim()) {
      this.error.set(
        this.method() === 'phone' ? 'Enter your phone number.' : 'Enter your email address.',
      );
      return;
    }

    this.pending.set(true);
    this.api
      .post<{ ok: true; retryAfterSeconds: number }>('/auth/otp/request', {
        method: this.method(),
        destination: this.value,
      })
      .subscribe({
        next: ({ retryAfterSeconds }) => {
          this.pending.set(false);
          this.router.navigate(['/otp'], {
            state: { destination: this.value, method: this.method(), retryAfterSeconds },
          });
        },
        error: (err: unknown) => {
          this.pending.set(false);
          if (err instanceof ApiError && err.retryAfterSeconds) {
            this.error.set(`Please wait ${err.retryAfterSeconds}s before requesting another code.`);
          } else {
            this.error.set('Something went wrong. Please try again.');
          }
        },
      });
  }

  protected continueWithGoogle(): void {
    window.location.href = `${environment.apiUrl}/auth/google`;
  }
}
