import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth/auth.service';
import { ApiClient } from '../../core/api/api-client.service';
import { AccountService } from '../../core/account/account.service';
import { type UserRole } from '../../models';

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
  private readonly http = inject(HttpClient);
  private readonly account = inject(AccountService);

  protected readonly destination =
    (history.state as { destination?: string } | null)?.destination ?? '4564';
  protected readonly method =
    (history.state as { method?: 'email' | 'phone' } | null)?.method ?? 'phone';
  protected readonly role =
    (history.state as { role?: UserRole } | null)?.role ?? 'customer';

  protected code = '';
  protected readonly seconds = signal(RESEND_SECONDS);

  private mockUsers: any[] = [];
  private timer?: ReturnType<typeof setInterval>;

  protected readonly content = signal({
    titlePhone: 'Verify your phone',
    titleEmail: 'Verify your email',
    subtitle: 'We sent a 6-digit code to',
    cardTitle: 'Enter the code',
    cardSubtitle: 'The code expires in a few minutes.',
    inputLabel: '6-digit code',
    btnVerify: 'Verify & Continue',
    resendText: 'Didn’t receive the code?',
    resendCooldown: 'Resend in',
    btnResend: 'Resend code',
    errorOtpEmpty: 'Please enter the 6-digit verification code.',
    errorOtpInvalid: 'Please enter a valid 6-digit numeric code.',
    errorVerificationFailed: 'Verification failed: ',
    msgOtpSent: 'OTP sent successfully',
    msgOtpResentMock: 'OTP resent successfully (Mock)',
    errorResendFailed: 'Failed to resend OTP: ',
    msgSuccessNoToken: 'Verification successful, but no authentication token was returned by the server.'
  });

  ngOnInit(): void {
    // Load copy strings dynamically
    this.http.get<any>('data/auth.json').subscribe({
      next: (data) => {
        if (data && data.otp) {
          this.content.set({
            ...this.content(),
            ...data.otp
          });
        }
      },
      error: (err) => {
        console.error('Failed to load OTP copy from auth.json, using defaults', err);
      }
    });

    // Load mock users dynamically
    this.http.get<any[]>('data/mock-users.json').subscribe({
      next: (users) => {
        if (users) this.mockUsers = users;
      },
      error: (err) => {
        console.warn('Failed to load mock-users.json, fallback values will be used', err);
      }
    });

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
      alert(this.content().errorOtpEmpty);
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
          this.auth.setRoles([this.role]);
          this.updateMockProfile();
          this.router.navigate(['/account']);
        } else {
          alert(this.content().msgSuccessNoToken);
        }
      },
      error: (err) => {
        console.error(err);
        if (this.api.getBaseUrl() === '/api' && isLocalHostOrIP()) {
          console.warn('Backend offline, running local mock-users verification.');
          
          // Look up user by email or mobile destination
          const matchedUser = this.mockUsers.find(
            u => u.mail === this.destination || u.mobile === this.destination
          );
          
          if (matchedUser) {
            // Validate the specific OTP for this mock user
            if (otpCode === matchedUser.otp) {
              this.auth.signIn('mock-demo-jwt-token');
              this.auth.setRoles([matchedUser.role]);
              
              // Update mock profile info
              this.account.updateProfile({
                name: matchedUser.name,
                email: matchedUser.mail,
                phone: matchedUser.mobile
              });
              
              this.router.navigate(['/account']);
            } else {
              alert(`Verification failed: Invalid OTP code for ${matchedUser.role}. Please use ${matchedUser.otp}.`);
            }
          } else {
            // Fallback for random phone/email: standard Customer login with OTP 123456
            if (otpCode === '123456') {
              this.auth.signIn('mock-demo-jwt-token');
              this.auth.setRoles(['customer']);
              
              // Use default profile info
              this.updateMockProfile();
              
              this.router.navigate(['/account']);
            } else {
              alert('Verification failed: Invalid OTP code. For demo, use 123456 or a valid mock user OTP.');
            }
          }
        } else {
          alert(this.content().errorVerificationFailed + (err.error?.message || err.message));
        }
      },
    });
  }

  private updateMockProfile(): void {
    let roleName = 'Customer User';
    if (this.role === 'admin') roleName = 'Admin User';
    else if (this.role === 'marketing') roleName = 'Marketing Manager';
    else if (this.role === 'sales') roleName = 'Sales Executive';
    else if (this.role === 'driver') roleName = 'Driver Partner';

    const isEmail = this.method === 'email';
    this.account.updateProfile({
      name: roleName,
      email: isEmail ? this.destination : `${this.role}@mera-driver.com`,
      phone: isEmail ? '+91 99999 88888' : this.destination
    });
  }

  protected resend(): void {
    const isEmail = this.method === 'email';
    const endpoint = isEmail ? '/auth/send-mail-otp' : '/mobile-otp/send';
    const payload = isEmail ? { email: this.destination } : { mobile: this.destination };

    this.api.post(endpoint, payload).subscribe({
      next: () => {
        this.seconds.set(RESEND_SECONDS);
        alert(this.content().msgOtpSent);
      },
      error: (err) => {
        console.error(err);
        if (this.api.getBaseUrl() === '/api' && isLocalHostOrIP()) {
          this.seconds.set(RESEND_SECONDS);
          alert(this.content().msgOtpResentMock);
        } else {
          alert(this.content().errorResendFailed + (err.error?.message || err.message));
        }
      },
    });
  }

  protected back(): void {
    this.router.navigate(['/sign-in']);
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
