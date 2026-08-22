import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
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
export class SignIn implements OnInit {
  private readonly router = inject(Router);
  private readonly authApi = inject(AuthApiService);
  private readonly http = inject(HttpClient);

  protected readonly method = signal<Method>('phone');
  protected value = '';

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly emailError = signal('');
  protected readonly phoneError = signal('');

  protected readonly googleUrl = this.authApi.googleSignInUrl();

  protected readonly content = signal({
    title: 'Sign in',
    subtitle: 'Choose your preferred sign-in method.',
    tabEmail: 'Email',
    tabPhone: 'Phone',
    labelPhone: 'Phone number',
    labelEmail: 'Email address',
    btnSendOtp: 'Send OTP',
    dividerText: 'or',
    btnGoogle: 'Continue with Google',
    disclaimer: 'By continuing, you agree to our Terms of Service.'
  });

  ngOnInit(): void {
    // Load copy strings dynamically
    this.http.get<any>('data/auth.json').subscribe({
      next: (data) => {
        if (data && data.signin) {
          this.content.set({
            ...this.content(),
            ...data.signin
          });
        }
      },
      error: (err) => {
        console.error('Failed to load Sign-In copy, using defaults', err);
      }
    });
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
    const identifier = this.value.trim();
    if (!identifier) {
      this.error.set(
        this.method() === 'phone' ? 'Enter your phone number.' : 'Enter your email address.',
      );
      return;
    }

    // Frontend validation
    if (this.method() === 'phone') {
      const phoneRegex = /^[6-9]\d{9}$/;
      if (!phoneRegex.test(identifier)) {
        this.phoneError.set('Please enter a valid 10-digit mobile number.');
        return;
      }
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(identifier)) {
        this.emailError.set('Please enter a valid email address.');
        return;
      }
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
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.message || 'Could not send the code right now. Please try again.');
      },
    });
  }
}
