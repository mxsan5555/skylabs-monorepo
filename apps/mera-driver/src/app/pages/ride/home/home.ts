import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BookingService } from '../../../core/booking/booking.service';
import { GoogleMapsLoaderService } from '../../../core/google-maps/google-maps-loader.service';
import { RideMap } from '../../../shared/ride-map/ride-map';
import type { Place } from '../../../models';

interface Suggestion { name: string; address: string; placeId: string }

/**
 * Booking home ("Plan your ride"). A full-bleed map with a bottom sheet holding
 * the pickup / where-to entry and saved/recent places. Picking a destination
 * sets the drop and moves to the "Choose a ride" step. Replaces the old
 * marketing home as the app's landing screen.
 */
@Component({
  selector: 'md-ride-home',
  imports: [RideMap],
  templateUrl: './home.html',
  styleUrl: './home.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class RideHome {
  protected readonly booking = inject(BookingService);
  private readonly router = inject(Router);
  private readonly maps = inject(GoogleMapsLoaderService);

  protected readonly pickupQuery = signal(this.booking.pickup()?.label ?? '');
  protected readonly dropQuery = signal('');
  protected readonly pickupSuggestions = signal<Suggestion[]>([]);
  protected readonly dropSuggestions = signal<Suggestion[]>([]);
  protected readonly activeField = signal<'pickup' | 'drop' | null>(null);
  protected readonly placesError = signal<string | null>(null);

  private pickupDebounce?: ReturnType<typeof setTimeout>;
  private dropDebounce?: ReturnType<typeof setTimeout>;

  protected onPickupInput(value: string): void {
    this.pickupQuery.set(value);
    // Editing after a selection invalidates the previously-resolved coordinates — a stale
    // pickup must never silently survive into the next quote.
    this.booking.setPickup(null);
    this.activeField.set('pickup');
    clearTimeout(this.pickupDebounce);
    this.pickupDebounce = setTimeout(() => this.search(value, this.pickupSuggestions), 250);
  }

  protected onDropInput(value: string): void {
    this.dropQuery.set(value);
    this.activeField.set('drop');
    clearTimeout(this.dropDebounce);
    this.dropDebounce = setTimeout(() => this.search(value, this.dropSuggestions), 250);
  }

  private async search(value: string, target: typeof this.pickupSuggestions): Promise<void> {
    if (value.trim().length < 3) { target.set([]); return; }
    try {
      const google = await this.maps.load();
      new google.maps.places.AutocompleteService().getPlacePredictions(
        { input: value },
        (predictions: any, status: string) => {
          if (status === 'OK' && predictions) {
            target.set(predictions.map((p: any) => ({ name: p.structured_formatting?.main_text ?? p.description, address: p.description, placeId: p.place_id })));
            this.placesError.set(null);
          } else {
            target.set([]);
            if (status !== 'ZERO_RESULTS') this.placesError.set('Address search is unavailable right now. You can still continue once a pickup and drop are set.');
          }
        },
      );
    } catch {
      // No key configured / script failed — manual entry remains possible, just without
      // suggestions; the booking flow further down still requires a resolved Place to proceed.
      this.placesError.set('Address search is unavailable right now.');
    }
  }

  protected async selectPickup(suggestion: Suggestion): Promise<void> {
    const place = await this.resolvePlace(suggestion);
    this.pickupSuggestions.set([]);
    if (!place) return;
    this.pickupQuery.set(place.label);
    this.booking.setPickup(place);
  }

  protected async selectDropSuggestion(suggestion: Suggestion): Promise<void> {
    const place = await this.resolvePlace(suggestion);
    this.dropSuggestions.set([]);
    if (!place) return;
    this.chooseDrop(place);
  }

  private async resolvePlace(suggestion: Suggestion): Promise<Place | null> {
    try {
      const google = await this.maps.load();
      return await new Promise<Place | null>((resolve) => {
        new google.maps.Geocoder().geocode({ placeId: suggestion.placeId }, (results: any, status: string) => {
          if (status === 'OK' && results?.[0]) {
            const loc = results[0].geometry.location;
            resolve({ id: suggestion.placeId, label: suggestion.name, address: suggestion.address, coord: { lat: loc.lat(), lng: loc.lng() }, kind: 'recent' });
          } else {
            this.placesError.set('Could not resolve that address. Try another search.');
            resolve(null);
          }
        });
      });
    } catch {
      this.placesError.set('Address search is unavailable right now.');
      return null;
    }
  }

  protected chooseDrop(place: Place): void {
    this.booking.setDrop(place);
    this.router.navigate(['/ride/options']);
  }

  protected shareLocation(): void {
    this.router.navigate(['/ride/location']);
  }
}
