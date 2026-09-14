import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BookingService } from '../../../core/booking/booking.service';
import type { PaymentMethod } from '../../../models';

/**
 * "Pay with" step (reference Image #6). Personal/Business profile tabs, a wallet
 * balance row, and the saved payment methods with a selected check + expired
 * state. Confirming books the ride and moves to the confirmation screen.
 */
@Component({
  selector: 'md-ride-payment',
  templateUrl: './payment.html',
  styleUrl: './payment.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class RidePayment {
  protected readonly booking = inject(BookingService);
  private readonly router = inject(Router);

  protected select(method: PaymentMethod): void {
    this.booking.selectPayment(method);
  }

  protected back(): void {
    this.router.navigate(['/ride/verify']);
  }

  protected confirm(): void {
    this.router.navigate(['/ride/confirmed']);
  }
}
