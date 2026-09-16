import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthApiService } from '../../core/auth/auth-api.service';

/** Verifies the reset code from `/forgot-password` and sets a new password. */
@Component({
  selector: 'md-reset-password',
  templateUrl: './reset-password.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ResetPassword implements OnInit {
  private readonly router = inject(Router);
  private readonly authApi = inject(AuthApiService);

  protected readonly destination = (history.state as { destination?: string } | null)?.destination ?? '';
  protected code = '';
  protected newPassword = '';
  protected confirmPassword = '';
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal(false);
  protected readonly submitting = signal(false);

  ngOnInit(): void {
    if (!this.destination) {
      this.router.navigate(['/forgot-password']);
    }
  }

  protected submit(): void {
    if (this.code.length !== 6) {
      this.error.set('Enter the 6-digit code.');
      return;
    }
    if (this.newPassword.length < 8) {
      this.error.set('Password must be at least 8 characters.');
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.error.set('Passwords do not match.');
      return;
    }

    this.error.set(null);
    this.submitting.set(true);
    this.authApi.resetPassword(this.destination, this.code, this.newPassword).subscribe({
      next: () => {
        this.submitting.set(false);
        this.success.set(true);
      },
      error: () => {
        this.submitting.set(false);
        this.error.set('That code is invalid or has expired.');
      },
    });
  }

  protected goToSignIn(): void {
    this.router.navigate(['/sign-in']);
  }
}
