import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BookingService } from '../../../core/booking/booking.service';
import { DEFAULT_PICKUP } from '../../../core/booking/mock-data';

/**
 * "Enable location" prompt (reference Image #3). Asks for the browser geolocation
 * permission so the pickup can be set to the rider's real position; on allow (or
 * deny) it falls back to a mock pickup and returns home. Pure UX — no data leaves
 * the device.
 */
@Component({
  selector: 'md-ride-location',
  templateUrl: './location.html',
  styleUrl: './location.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class RideLocation {
  private readonly booking = inject(BookingService);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);

  protected allow(): void {
    this.busy.set(true);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.finish();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.booking.setPickup({
          ...DEFAULT_PICKUP,
          label: 'Current location',
          coord: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        });
        this.finish();
      },
      () => this.finish(),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  protected skip(): void {
    this.finish();
  }

  private finish(): void {
    this.busy.set(false);
    this.router.navigate(['/ride']);
  }
}
