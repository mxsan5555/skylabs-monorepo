import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';
import { AuthApiService } from '../../core/auth/auth-api.service';

type Method = 'email' | 'phone';
type Persona = 'customer' | 'driver';
type LoginMode = 'otp' | 'password';

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
export class SignIn implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authApi = inject(AuthApiService);
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  /** Set by `authInterceptor` redirecting here after a genuine refresh-token failure — shows
   *  a clear reason instead of a silent, confusing return to the sign-in screen. */
  protected readonly sessionExpired = signal(false);

  /** OTP is the default and only method for the public customer/driver personas; password
   *  login is the additive option (mainly for admin-console/staff roles) — a toggle, not a
   *  separate route, since which role you are is resolved server-side after login, not chosen. */
  protected readonly loginMode = signal<LoginMode>('otp');
  protected password = '';
  protected readonly passwordError = signal('');
  protected readonly passwordLoading = signal(false);

  protected readonly method = signal<Method>('phone');
  /** Which persona is signing up — preset from the header CTA (router state). */
  protected readonly role = signal<Persona>(
    (history.state as { role?: Persona } | null)?.role === 'driver'
      ? 'driver'
      : 'customer',
  );
  protected value = '';
  protected readonly emailError = signal('');
  protected readonly phoneError = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly googleUrl = signal('/auth/google');
  protected readonly content = signal({
    labelCustomer: 'Customer',
    labelDriver: 'Driver',
    tabEmail: 'Email',
    tabPhone: 'Phone',
    labelPhone: 'Phone Number',
    labelEmail: 'Email Address',
    btnSendOtp: 'Send OTP',
    dividerText: 'or',
    btnGoogle: 'Continue with Google',
    disclaimer: 'By signing in, you agree to our Terms of Service & Privacy Policy',
  });

  ngOnInit(): void {
    this.sessionExpired.set(this.route.snapshot.queryParamMap.get('sessionExpired') === '1');
  }

  protected setRole(role: Persona): void {
    this.role.set(role);
  }

  protected onTabChange(event: Event): void {
    const index = (event.target as HTMLElement & { activeTabIndex: number }).activeTabIndex;
    this.method.set(index === 1 ? 'phone' : 'email');
    this.value = '';
    this.emailError.set('');
    this.phoneError.set('');
    this.error.set(null);
  }

  protected onInput(val: string): void {
    this.value = val;
    this.emailError.set('');
    this.phoneError.set('');
    this.error.set(null);
  }

  protected sendOtp(): void {
    const val = this.value.trim();
    if (!val) {
      if (this.method() === 'phone') {
        this.phoneError.set('Please enter a valid phone number.');
      } else {
        this.emailError.set('Please enter a valid email address.');
      }
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.authApi.requestOtp(val, 'login').subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/otp'], {
          state: {
            destination: val,
            method: this.method(),
            role: this.role(),
          },
        });
      },
      error: () => {
        this.loading.set(false);
        // Navigate to OTP page so user can verify code
        this.router.navigate(['/otp'], {
          state: {
            destination: val,
            method: this.method(),
            role: this.role(),
          },
        });
      },
    });
  }

  protected toggleLoginMode(): void {
    this.loginMode.set(this.loginMode() === 'otp' ? 'password' : 'otp');
    this.password = '';
    this.passwordError.set('');
    this.error.set(null);
  }

  protected submitPassword(): void {
    const val = this.value.trim();
    if (!val) {
      this.passwordError.set('Enter your email or phone number.');
      return;
    }
    if (!this.password) {
      this.passwordError.set('Enter your password.');
      return;
    }

    this.passwordError.set('');
    this.passwordLoading.set(true);
    this.authApi.loginWithPassword(val, this.password).subscribe({
      next: async (result) => {
        await this.auth.signIn(result.accessToken, result.refreshToken);
        this.passwordLoading.set(false);
        // A linked Driver or Customer account lands on its own self-service portal, never
        // the admin console — same ownership signal as `driverPortalGuard`/`customerPortalGuard`.
        const bootstrap = this.auth.bootstrap();
        this.router.navigate([bootstrap?.driver ? '/driver' : bootstrap?.customer ? '/customer' : '/account/dashboard']);
      },
      error: () => {
        this.passwordLoading.set(false);
        this.passwordError.set('Invalid identifier or password.');
      },
    });
  }

  protected goToForgotPassword(): void {
    this.router.navigate(['/forgot-password'], { state: { destination: this.value.trim() } });
  }
}