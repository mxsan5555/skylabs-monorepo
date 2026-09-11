import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal, type OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthApiService } from '../../core/auth/auth-api.service';

type Method = 'email' | 'phone';
type Persona = 'customer' | 'driver';

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
  protected readonly role = signal<Persona>(
    (history.state as { role?: Persona } | null)?.role === 'driver'
      ? 'driver'
      : 'customer',
  );

  protected readonly content = signal({
    tabEmail: 'Email',
    tabPhone: 'Phone',
    labelPhone: 'Phone number',
    labelEmail: 'Email address',
    btnSendOtp: 'Send OTP',
    dividerText: 'or continue with',
    btnGoogle: 'Continue with Google',
    disclaimer: 'We’ll never share your contact details.',
    errorPhoneEmpty: 'Please enter your phone number.',
    errorEmailEmpty: 'Please enter your email address.',
    errorEmailInvalid: 'Please enter a valid email address.',
    errorPhoneInvalid: 'Please enter a valid 10-digit phone number.',
  });
  protected readonly emailError = signal('');
  protected readonly phoneError = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly googleUrl = this.authApi.googleSignInUrl();

  protected value = '';

  ngOnInit(): void {
    this.http.get<any>('data/auth.json').subscribe({
      next: (data) => {
        if (data?.signin) {
          this.content.set({ ...this.content(), ...data.signin });
        }
      },
      error: () => undefined,
    });
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
    const destination = this.value.trim();
    if (this.method() === 'phone') {
      if (!destination) {
        this.phoneError.set(this.content().errorPhoneEmpty);
        return;
      }
      if (!/^\d{10}$/.test(destination)) {
        this.phoneError.set(this.content().errorPhoneInvalid);
        return;
      }
    } else {
      if (!destination) {
        this.emailError.set(this.content().errorEmailEmpty);
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination)) {
        this.emailError.set(this.content().errorEmailInvalid);
        return;
      }
    }

    this.loading.set(true);
    this.error.set(null);
    this.authApi.requestOtp(destination, 'login').subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/otp'], {
          state: {
            destination,
            method: this.method(),
            role: this.role(),
          },
        });
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err instanceof Error ? err.message : 'Unable to send OTP.');
      },
    });
  }
}
