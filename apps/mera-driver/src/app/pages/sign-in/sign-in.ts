import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ApiClient } from '../../core/api/api-client.service';
import { AuthService } from '../../core/auth/auth.service';

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
export class SignIn implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  protected readonly method = signal<Method>('phone');
  protected value = '';

  protected readonly emailError = signal<string>('');
  protected readonly phoneError = signal<string>('');

  protected readonly content = signal({
    title: 'Sign in',
    subtitle: 'Enter your details to receive a one-time code.',
    tabEmail: 'Email',
    tabPhone: 'Phone',
    labelEmail: 'Email',
    labelPhone: 'Phone number',
    btnSendOtp: 'Send OTP',
    dividerText: 'or continue with',
    btnGoogle: 'Continue with Google',
    disclaimer: 'New users are registered automatically.',
    errorEmailEmpty: 'Please enter your email.',
    errorPhoneEmpty: 'Please enter your phone number.',
    errorEmailInvalid: 'Please enter a valid email address.',
    errorPhoneInvalid: 'Please enter a valid 10-digit phone number.',
    errorOtpSendFailed: 'Failed to send OTP: '
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
        console.error('Failed to load sign-in copy from auth.json, using defaults', err);
      }
    });

    this.route.queryParams.subscribe((params) => {
      const token = params['token'];
      if (token) {
        this.auth.signIn(token);
        this.router.navigate(['/account']);
      }
    });
  }



  protected onTabChange(event: Event): void {
    const index = (event.target as HTMLElement & { activeTabIndex: number })
      .activeTabIndex;
    this.method.set(index === 1 ? 'phone' : 'email');
    this.value = '';
    this.emailError.set('');
    this.phoneError.set('');
  }

  protected onInput(val: string): void {
    this.value = val;
    this.emailError.set('');
    this.phoneError.set('');
  }

  protected sendOtp(): void {
    const val = this.value.trim();
    const isEmail = this.method() === 'email';

    this.emailError.set('');
    this.phoneError.set('');

    if (!val) {
      if (isEmail) {
        this.emailError.set(this.content().errorEmailEmpty);
      } else {
        this.phoneError.set(this.content().errorPhoneEmpty);
      }
      return;
    }

    if (isEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(val)) {
        this.emailError.set(this.content().errorEmailInvalid);
        return;
      }
    } else {
      const phoneRegex = /^[0-9]{10}$/;
      if (!phoneRegex.test(val)) {
        this.phoneError.set(this.content().errorPhoneInvalid);
        return;
      }
    }

    const endpoint = isEmail ? '/auth/send-mail-otp' : '/mobile-otp/send';
    const payload = isEmail ? { email: val } : { mobile: val };

    this.api.post(endpoint, payload).subscribe({
      next: () => {
        this.router.navigate(['/otp'], {
          state: { destination: val, method: this.method() },
        });
      },
      error: (err) => {
        console.error(err);
        if (this.api.getBaseUrl() === '/api' && isLocalHostOrIP()) {
          console.warn('Backend offline, proceeding to OTP screen with mock data.');
          this.router.navigate(['/otp'], {
            state: { destination: val, method: this.method() },
          });
        } else {
          const errMsg = err.error?.message || err.message;
          if (isEmail) {
            this.emailError.set(this.content().errorOtpSendFailed + errMsg);
          } else {
            this.phoneError.set(this.content().errorOtpSendFailed + errMsg);
          }
        }
      },
    });
  }

  protected continueWithGoogle(): void {
    const baseUrl = this.api.getBaseUrl();
    if (baseUrl === '/api' && isLocalHostOrIP()) {
      console.warn('Backend is offline/local, logging in with mock token.');
      this.auth.signIn('mock-google-token');
      this.router.navigate(['/account']);
    } else {
      window.location.href = `${baseUrl}/auth/google`;
    }
  }
}

function isLocalHostOrIP(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return hostname === 'localhost' || 
         hostname === '127.0.0.1' || 
         hostname.startsWith('192.168.') || 
         hostname.startsWith('10.') || 
         hostname.startsWith('172.');
}
