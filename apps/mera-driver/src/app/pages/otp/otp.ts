import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ApiClient } from '../../core/api/api-client.service';

const RESEND_SECONDS = 24;

/**
 * OTP screen. Shows where the code was sent, takes the 6-digit code, and on
 * verify signs the user in and returns home. Includes a resend countdown.
 * Wired to the real AuthService (mock token until the auth API exists).
 */
@Component({
  selector: 'md-otp',
  templateUrl: './otp.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Otp implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiClient);

  protected readonly destination =
    (history.state as { destination?: string } | null)?.destination ?? '4564';
  protected readonly method =
    (history.state as { method?: 'email' | 'phone' } | null)?.method ?? 'phone';

  protected code = '';
  protected readonly seconds = signal(RESEND_SECONDS);

  private timer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.timer = setInterval(() => {
      const s = this.seconds();
      if (s > 0) this.seconds.set(s - 1);
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  protected verify(): void {
    const otpCode = this.code.trim();
    if (!otpCode) {
      alert('Please enter the OTP code');
      return;
    }

    const isEmail = this.method === 'email';
    const endpoint = isEmail ? '/auth/verify-mail-otp' : '/mobile-otp/verify';
    const payload = isEmail 
      ? { email: this.destination, otp: otpCode } 
      : { mobile: this.destination, otp: otpCode };

    this.api.post<any>(endpoint, payload).subscribe({
      next: (res) => {
        if (res && res.token) {
          this.auth.signIn(res.token);
          this.router.navigate(['/account']);
        } else {
          alert('Verification successful, but no authentication token was returned by the server.');
        }
      },
      error: (err) => {
        console.error(err);
        if (this.api.getBaseUrl() === '/api' && window.location.hostname === 'localhost') {
          console.warn('Backend offline, logging in with mock token.');
          this.auth.signIn('mock-demo-jwt-token');
          this.router.navigate(['/account']);
        } else {
          alert('OTP Verification failed: ' + (err.error?.message || err.message));
        }
      },
    });
  }

  protected resend(): void {
    const isEmail = this.method === 'email';
    const endpoint = isEmail ? '/auth/send-mail-otp' : '/mobile-otp/send';
    const payload = isEmail ? { email: this.destination } : { mobile: this.destination };

    this.api.post(endpoint, payload).subscribe({
      next: () => {
        this.seconds.set(RESEND_SECONDS);
        alert('OTP sent successfully');
      },
      error: (err) => {
        console.error(err);
        if (this.api.getBaseUrl() === '/api' && window.location.hostname === 'localhost') {
          this.seconds.set(RESEND_SECONDS);
          alert('OTP resent successfully (Mock)');
        } else {
          alert('Failed to resend OTP: ' + (err.error?.message || err.message));
        }
      },
    });
  }

  protected back(): void {
    this.router.navigate(['/sign-in']);
  }
}
