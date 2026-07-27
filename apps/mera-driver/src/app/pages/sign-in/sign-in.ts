import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

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

  protected readonly method = signal<Method>('phone');
  protected value = '';

  protected onTabChange(event: Event): void {
    const index = (event.target as HTMLElement & { activeTabIndex: number })
      .activeTabIndex;
    this.method.set(index === 1 ? 'phone' : 'email');
  }

  protected sendOtp(): void {
    const fallback = this.method() === 'phone' ? '4564' : 'you@email.com';
    this.router.navigate(['/otp'], {
      state: { destination: this.value || fallback, method: this.method() },
    });
  }
}
