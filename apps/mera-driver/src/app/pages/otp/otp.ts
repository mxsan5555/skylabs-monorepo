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

  protected readonly destination =
    (history.state as { destination?: string } | null)?.destination ?? '4564';

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
    // Real verification will call the auth API; for now accept any code.
    this.auth.signIn('mock-token');
    this.router.navigate(['/']);
  }

  protected resend(): void {
    this.seconds.set(RESEND_SECONDS);
  }

  protected back(): void {
    this.router.navigate(['/sign-in']);
  }
}
