import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BookingService } from '../../../core/booking/booking.service';
import type { DriverSummary } from '../../../models';

/**
 * "Choose a driver" step. Lists available drivers with rating, vehicle, price, a
 * police-verified badge, and a bookmark toggle. Selecting one stores it on the
 * booking and moves to the trip-start OTP.
 */
@Component({
  selector: 'md-ride-drivers',
  templateUrl: './drivers.html',
  styleUrl: './drivers.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class RideDrivers {
  protected readonly booking = inject(BookingService);
  private readonly router = inject(Router);

  protected readonly selectedId = signal<string | null>(null);

  protected toggleBookmark(event: Event, id: string): void {
    event.stopPropagation();
    this.booking.toggleBookmark(id);
  }

  protected pick(driver: DriverSummary): void {
    this.selectedId.set(driver.id);
  }

  protected back(): void {
    this.router.navigate(['/ride/options']);
  }

  protected confirm(): void {
    const driver = this.booking
      .drivers()
      .find((d) => d.id === this.selectedId());
    if (!driver) return;
    this.booking.selectDriver(driver);
    this.router.navigate(['/ride/verify']);
  }
}
