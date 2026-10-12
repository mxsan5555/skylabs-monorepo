import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  EventEmitter,
  Input,
  Output,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LocationService } from '../../core/location/location.service';
import type { CatalogCity } from '../../core/location/geo';

import { BookingService } from '../../core/booking/booking.service';
import type { Place } from '../../models';

@Component({
  selector: 'md-city-picker-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './city-picker-dialog.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class CityPickerDialog {
  protected readonly locationService = inject(LocationService);
  private readonly booking = inject(BookingService);

  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();

  protected async useCurrentLocation(): Promise<void> {
    const place = await this.locationService.autoDetectLocation(false);
    if (place) {
      this.booking.setPickup(place);
    }
    this.closed.emit();
  }

  protected selectCity(city: CatalogCity): void {
    this.locationService.setCity(city);
    const place: Place = {
      id: `city-${city.id}`,
      label: `${city.name}, ${city.state}`,
      address: `${city.name}, ${city.state}, India`,
      coord: { lat: city.lat, lng: city.lng },
      kind: 'recent',
    };
    this.booking.setPickup(place);
    this.closed.emit();
  }

  protected onClose(): void {
    this.closed.emit();
  }
}
