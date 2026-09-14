import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BookingService } from '../../../core/booking/booking.service';

/**
 * Booking confirmed. Closes the loop with a summary of the assigned driver,
 * vehicle, ETA and fare. "Done" clears the in-progress booking and returns home.
 */
@Component({
  selector: 'md-ride-confirmed',
  templateUrl: './confirmed.html',
  styleUrl: './confirmed.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class RideConfirmed {
  protected readonly booking = inject(BookingService);
  private readonly router = inject(Router);

  protected done(): void {
    this.booking.reset();
    this.router.navigate(['/ride']);
  }
}
