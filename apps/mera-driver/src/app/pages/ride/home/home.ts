import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BookingService } from '../../../core/booking/booking.service';
import { LocationService } from '../../../core/location/location.service';
import { RideMap } from '../../../shared/ride-map/ride-map';
import { LocationPicker } from '../../../shared/location-picker/location-picker';
import type { Place } from '../../../models';

/**
 * Booking home ("Plan your ride"). A full-bleed map with a bottom sheet holding
 * the pickup / where-to entry and saved/recent places. Picking a destination
 * sets the drop and moves to the "Choose a ride" step.
 */
@Component({
  selector: 'md-ride-home',
  imports: [RideMap, LocationPicker],
  templateUrl: './home.html',
  styleUrl: './home.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class RideHome {
  protected readonly booking = inject(BookingService);
  protected readonly locationService = inject(LocationService);
  private readonly router = inject(Router);

  protected onPickupSelected(place: Place): void {
    this.booking.setPickup(place);
  }

  protected onDropSelected(place: Place): void {
    this.booking.setDrop(place);
    this.router.navigate(['/ride/options']);
  }

  protected chooseDrop(place: Place): void {
    this.booking.setDrop(place);
    this.router.navigate(['/ride/options']);
  }

  protected shareLocation(): void {
    this.router.navigate(['/ride/location']);
  }
}
