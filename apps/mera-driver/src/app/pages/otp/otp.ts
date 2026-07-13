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
import { ApiClient, ApiError } from '../../core/api/api-client.service';
import type { User, UserRole } from '../../models';

const DEFAULT_RETRY_SECONDS = 30;

interface OtpHistoryState {
  destination?: string;
  method?: 'email' | 'phone';
  retryAfterSeconds?: number;
}

/**
 * OTP screen. Shows where the code was sent, takes the 6-digit code, and on
 * verify signs the user in via mera-driver-api and returns to the public home
 * page. Resend re-requests a code from the backend; the countdown is driven by
 * the server's `retryAfterSeconds`, not a hardcoded constant.
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

  private readonly state = (history.state as OtpHistoryState | null) ?? {};
  protected readonly destination = this.state.destination ?? '';
  protected readonly method = this.state.method ?? 'email';

  protected code = '';
  protected readonly seconds = signal(this.state.retryAfterSeconds ?? DEFAULT_RETRY_SECONDS);
  protected readonly error = signal<string | null>(null);
  protected readonly pending = signal(false);
  protected readonly resending = signal(false);

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
    if (this.pending() || this.code.length !== 6) return;
    this.error.set(null);
    this.pending.set(true);

    this.api
      .post<{ token: string; roles: UserRole[]; user: User }>('/auth/otp/verify', {
        method: this.method,
        destination: this.destination,
        code: this.code,
      })
      .subscribe({
        next: (result) => {
          this.pending.set(false);
          this.auth.signIn(result.token, result.roles, result.user);
          this.router.navigate(['/']);
        },
        error: (err: unknown) => {
          this.pending.set(false);
          if (err instanceof ApiError && err.code === 'too_many_attempts') {
            this.error.set('Too many attempts. Please request a new code.');
          } else {
            this.error.set('That code is invalid or has expired.');
          }
        },
      });
  }

  protected resend(): void {
    if (this.resending() || this.seconds() > 0) return;
    this.resending.set(true);
    this.error.set(null);

    this.api
      .post<{ ok: true; retryAfterSeconds: number }>('/auth/otp/request', {
        method: this.method,
        destination: this.destination,
      })
      .subscribe({
        next: ({ retryAfterSeconds }) => {
          this.resending.set(false);
          this.seconds.set(retryAfterSeconds);
        },
        error: () => {
          this.resending.set(false);
          this.error.set('Could not resend the code. Please try again shortly.');
        },
      });
  }

  protected back(): void {
    this.router.navigate(['/sign-in']);
  }
}
