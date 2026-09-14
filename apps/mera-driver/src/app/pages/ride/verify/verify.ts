import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { BookingService } from '../../../core/booking/booking.service';

const RESEND_SECONDS = 20;

/**
 * Trip-start OTP (item 14) — distinct from the login OTP. The rider confirms a
 * 4-digit code the driver shares on arrival before the trip begins, then
 * continues to payment. Four single-char boxes with auto-advance, matching the
 * reference. Mock: any 4 digits are accepted.
 */
@Component({
  selector: 'md-ride-verify',
  templateUrl: './verify.html',
  styleUrl: './verify.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class RideVerify implements OnInit, OnDestroy {
  protected readonly booking = inject(BookingService);
  private readonly router = inject(Router);

  protected readonly digits = signal(['', '', '', '']);
  protected readonly seconds = signal(RESEND_SECONDS);
  protected readonly complete = computed(() =>
    this.digits().every((d) => d !== ''),
  );

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

  protected onInput(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, '').slice(-1);
    input.value = value;
    this.digits.update((d) => {
      const next = [...d];
      next[index] = value;
      return next;
    });
    if (value && index < 3) {
      const next = document.getElementById(`start-otp-${index + 1}`);
      (next as HTMLInputElement | null)?.focus();
    }
  }

  protected onKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && !this.digits()[index] && index > 0) {
      const prev = document.getElementById(`start-otp-${index - 1}`);
      (prev as HTMLInputElement | null)?.focus();
    }
  }

  protected resend(): void {
    this.seconds.set(RESEND_SECONDS);
  }

  protected back(): void {
    this.router.navigate(['/ride/drivers']);
  }

  protected verify(): void {
    if (!this.complete()) return;
    this.router.navigate(['/ride/payment']);
  }
}
