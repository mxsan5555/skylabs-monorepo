import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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

  protected readonly method = signal<Method>('phone');
  protected value = '';

  protected readonly emailError = signal<string>('');
  protected readonly phoneError = signal<string>('');

  ngOnInit(): void {
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
        this.emailError.set('Please enter your email.');
      } else {
        this.phoneError.set('Please enter your phone number.');
      }
      return;
    }

    if (isEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(val)) {
        this.emailError.set('Please enter a valid email address.');
        return;
      }
    } else {
      const phoneRegex = /^[0-9]{10}$/;
      if (!phoneRegex.test(val)) {
        this.phoneError.set('Please enter a valid 10-digit phone number.');
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
        if (this.api.getBaseUrl() === '/api' && window.location.hostname === 'localhost') {
          console.warn('Backend offline, proceeding to OTP screen with mock data.');
          this.router.navigate(['/otp'], {
            state: { destination: val, method: this.method() },
          });
        } else {
          const errMsg = err.error?.message || err.message;
          if (isEmail) {
            this.emailError.set('Failed to send OTP: ' + errMsg);
          } else {
            this.phoneError.set('Failed to send OTP: ' + errMsg);
          }
        }
      },
    });
  }

  protected continueWithGoogle(): void {
    const baseUrl = this.api.getBaseUrl();
    if (baseUrl === '/api' && window.location.hostname === 'localhost') {
      console.warn('Backend is offline/local, logging in with mock token.');
      this.auth.signIn('mock-google-token');
      this.router.navigate(['/account']);
    } else {
      window.location.href = `${baseUrl}/auth/google`;
    }
  }
}
