import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BookingService } from '../../core/booking/booking.service';
import { LocationService } from '../../core/location/location.service';
import type { Coordinates } from '../../core/location/geo';
import type { Place } from '../../models';

declare global {
  interface Window {
    google: any;
  }
}

export interface GoogleSearchResult {
  name: string;
  address: string;
  placeId: string;
}

const GOOGLE_MAPS_API_KEY = 'AIzaSyCc0KQ40uWG_mnZOcmqYw324z9MXCjm28c';

@Component({
  selector: 'md-location-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './location-picker.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: {
    class: 'relative block w-full',
  },
})
export class LocationPicker implements OnInit, OnChanges {
  private readonly booking = inject(BookingService);
  private readonly locationService = inject(LocationService);

  @Input() placeholder = 'Search location...';
  @Input() value = '';
  @Input() type: 'pickup' | 'drop' = 'pickup';

  @Output() placeSelected = new EventEmitter<Place>();
  @Output() valueChange = new EventEmitter<string>();

  protected readonly showSuggestions = signal<boolean>(false);
  protected readonly isLocating = signal<boolean>(false);
  protected readonly isSearching = signal<boolean>(false);
  protected readonly searchQuery = signal<string>('');
  protected readonly googlePredictions = signal<GoogleSearchResult[]>([]);
  protected readonly apiError = signal<string | null>(null);

  ngOnInit(): void {
    this.searchQuery.set(this.value);
    this.loadGoogleMapsSdk();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] && changes['value'].currentValue !== undefined) {
      this.searchQuery.set(changes['value'].currentValue);
    }
  }

  private loadGoogleMapsSdk(): void {
    if (window.google && window.google.maps && window.google.maps.places) {
      return;
    }

    if (document.getElementById('google-maps-api-script')) {
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.id = 'google-maps-api-script';
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      this.apiError.set('Failed to load Google Maps API.');
    };
    document.head.appendChild(script);
  }

  protected onInputFocus(): void {
    const val = this.searchQuery();
    this.showSuggestions.set(true);
    if (val.trim().length >= 2) {
      this.fetchGooglePredictions(val);
    }
  }

  protected onInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const val = input.value;
    this.searchQuery.set(val);
    this.valueChange.emit(val);
    this.showSuggestions.set(true);

    if (val.trim().length >= 2) {
      this.fetchGooglePredictions(val);
    } else {
      this.googlePredictions.set([]);
    }
  }

  private fetchGooglePredictions(query: string): void {
    if (!window.google || !window.google.maps || !window.google.maps.places) {
      return;
    }

    this.isSearching.set(true);
    const autocompleteService = new window.google.maps.places.AutocompleteService();
    autocompleteService.getPlacePredictions(
      { input: query, componentRestrictions: { country: 'in' } },
      (predictions: any[], status: any) => {
        this.isSearching.set(false);
        if (status === 'OK' && predictions) {
          const results: GoogleSearchResult[] = predictions.map((pred) => ({
            name: pred.structured_formatting?.main_text || pred.description,
            address: pred.description,
            placeId: pred.place_id,
          }));
          this.googlePredictions.set(results);
          this.apiError.set(null);
        } else {
          this.googlePredictions.set([]);
          if (status === 'REQUEST_DENIED') {
            this.apiError.set('Google Places API request denied.');
          }
        }
      },
    );
  }

  protected selectGooglePlace(place: GoogleSearchResult): void {
    this.searchQuery.set(place.name);

    if (!window.google || !window.google.maps) {
      this.apiError.set('Google Maps service is unavailable. Please try again.');
      return;
    }

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ placeId: place.placeId }, (results: any[], status: any) => {
      if (status === 'OK' && results && results[0]) {
        const loc = results[0].geometry.location;
        const lat = loc.lat();
        const lng = loc.lng();
        const formattedAddress = results[0].formatted_address || place.address;

        const components = results[0].address_components || [];
        const locality = components.find((c: any) => c.types.includes('locality'))?.long_name;
        const admin2 = components.find((c: any) => c.types.includes('administrative_area_level_2'))?.long_name;
        const admin1 = components.find((c: any) => c.types.includes('administrative_area_level_1'))?.long_name;
        const detectedCity = locality || admin2;
        const detectedState = admin1;

        if (this.type === 'pickup') {
          this.locationService.updateFromCoordinates({ lat, lng }, detectedCity, detectedState);
        }

        const selectedPlace: Place = {
          id: place.placeId,
          label: place.name,
          address: formattedAddress,
          coord: { lat, lng },
          kind: 'recent',
        };
        this.emitPlace(selectedPlace);
        this.apiError.set(null);
      } else {
        this.apiError.set('Could not fetch precise location coordinates.');
      }
    });
  }

  protected async useCurrentLocation(): Promise<void> {
    this.isLocating.set(true);
    const place = await this.locationService.autoDetectLocation(false);
    this.isLocating.set(false);
    if (place) {
      this.emitPlace(place);
    }
  }

  private emitPlace(place: Place): void {
    this.searchQuery.set(place.label);
    this.placeSelected.emit(place);
    this.valueChange.emit(place.label);
    this.closeSuggestions();
  }

  protected closeSuggestions(): void {
    setTimeout(() => {
      this.showSuggestions.set(false);
    }, 250);
  }
}
