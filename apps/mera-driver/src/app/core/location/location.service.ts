import { Injectable, computed, inject, signal } from '@angular/core';
import { BookingService } from '../booking/booking.service';
import {
  CatalogCity,
  Coordinates,
  INDIAN_CITIES,
  haversineKm,
  matchCityByName,
  nearestCity,
} from './geo';
import type { Place } from '../../models';

const STORAGE_KEY = 'mera_driver_location';

export type LocationStatus = 'none' | 'locating' | 'ready';
export type LocationSource = 'saved' | 'browser' | 'none';

@Injectable({ providedIn: 'root' })
export class LocationService {
  private readonly booking = inject(BookingService);

  readonly cities = INDIAN_CITIES;

  private readonly _status = signal<LocationStatus>('none');
  private readonly _source = signal<LocationSource>('none');
  private readonly _city = signal<CatalogCity>(INDIAN_CITIES[0]); // Default Bengaluru
  private readonly _coords = signal<Coordinates | null>(null);

  readonly status = this._status.asReadonly();
  readonly source = this._source.asReadonly();
  readonly city = this._city.asReadonly();
  readonly coords = this._coords.asReadonly();

  readonly cityName = computed(() => this._city().name);
  readonly stateName = computed(() => this._city().state);

  constructor() {
    this.initSavedLocation();
  }

  private initSavedLocation(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: CatalogCity = JSON.parse(raw);
        const match = INDIAN_CITIES.find((c) => c.id === parsed.id);
        if (match) {
          this.applyCity(match, 'saved');
          return;
        }
      }
    } catch {
      // localStorage blocked/empty — fallback to default
    }
    this.applyCity(INDIAN_CITIES[0], 'none');
  }

  setCity(city: CatalogCity): void {
    this.writeSaved(city);
    this.applyCity(city, 'saved');
  }

  updateFromCoordinates(
    coords: Coordinates,
    detectedCityName?: string,
    detectedStateName?: string,
  ): void {
    this._coords.set(coords);
    let targetCity: CatalogCity | null = null;
    const nearest = nearestCity(coords, INDIAN_CITIES);

    if (detectedCityName) {
      targetCity = matchCityByName(detectedCityName, INDIAN_CITIES);
    }

    if (!targetCity) {
      const distToNearest = haversineKm(coords, { lat: nearest.lat, lng: nearest.lng });
      if (distToNearest <= 45) {
        targetCity = nearest;
      }
    }

    if (!targetCity) {
      const cleanName = detectedCityName
        ? detectedCityName.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        : nearest.name;
      const cleanState =
        detectedStateName && detectedStateName !== 'India'
          ? detectedStateName
          : nearest.state;

      targetCity = {
        id: cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        name: cleanName,
        state: cleanState,
        lat: coords.lat,
        lng: coords.lng,
      };
    }

    this.writeSaved(targetCity);
    this._city.set(targetCity);
    this._status.set('ready');
    this._source.set('browser');
  }

  autoDetectLocation(silent = true): Promise<Place | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        if (!silent) alert('Geolocation is not supported by your browser.');
        resolve(null);
        return;
      }

      this._status.set('locating');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const coords: Coordinates = { lat, lng };

          if (window.google && window.google.maps) {
            const geocoder = new window.google.maps.Geocoder();
            geocoder.geocode({ location: { lat, lng } }, (results: any[], status: any) => {
              let label = 'Current Location';
              let address = `GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
              let detectedCity: string | undefined = undefined;
              let detectedState: string | undefined = undefined;

              if (status === 'OK' && results && results.length > 0) {
                let sublocality = '';
                let neighborhood = '';
                let locality = '';
                let route = '';
                let admin2 = '';
                let admin1 = '';
                const fullFormatted = results[0].formatted_address || '';

                for (const res of results) {
                  for (const c of res.address_components || []) {
                    if (!sublocality && (c.types.includes('sublocality_level_1') || c.types.includes('sublocality'))) {
                      sublocality = c.long_name;
                    }
                    if (!neighborhood && c.types.includes('neighborhood')) {
                      neighborhood = c.long_name;
                    }
                    if (!locality && c.types.includes('locality')) {
                      locality = c.long_name;
                    }
                    if (!route && c.types.includes('route')) {
                      route = c.long_name;
                    }
                    if (!admin2 && c.types.includes('administrative_area_level_2')) {
                      admin2 = c.long_name;
                    }
                    if (!admin1 && c.types.includes('administrative_area_level_1')) {
                      admin1 = c.long_name;
                    }
                  }
                }

                detectedCity = locality || admin2;
                detectedState = admin1;

                if (sublocality && locality) {
                  label = `${sublocality}, ${locality}`;
                } else if (neighborhood && locality) {
                  label = `${neighborhood}, ${locality}`;
                } else if (sublocality) {
                  label = sublocality;
                } else if (route && locality) {
                  label = `${route}, ${locality}`;
                } else if (locality) {
                  label = locality;
                } else {
                  const cleanParts = fullFormatted
                    .split(',')
                    .map((s: string) => s.trim())
                    .filter((s: string) => s && !s.includes('+') && !/^\d+[\/\-]?\d*$/.test(s));
                  label = cleanParts.slice(0, 2).join(', ') || 'Current Location';
                }
                address = fullFormatted || `${label}, India`;
              }

              this.updateFromCoordinates(coords, detectedCity, detectedState);
              const currentPlace: Place = {
                id: 'current-location',
                label,
                address,
                coord: { lat, lng },
                kind: 'recent',
              };
              this._status.set('ready');
              resolve(currentPlace);
            });
          } else {
            this.updateFromCoordinates(coords);
            const currentPlace: Place = {
              id: 'current-location',
              label: 'Current Location',
              address: `GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
              coord: { lat, lng },
              kind: 'recent',
            };
            this._status.set('ready');
            resolve(currentPlace);
          }
        },
        (err) => {
          this._status.set('ready');
          if (!silent) {
            if (err.code === 1) {
              alert('Location permission was denied. Please allow location access in your browser settings.');
            } else {
              alert('Unable to detect current GPS location.');
            }
          }
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });
  }

  async requestBrowser(): Promise<Place | null> {
    const place = await this.autoDetectLocation(false);
    if (place) {
      this.booking.setPickup(place);
    }
    return place;
  }

  private applyCity(city: CatalogCity, source: LocationSource): void {
    this._city.set(city);
    this._coords.set({ lat: city.lat, lng: city.lng });
    this._status.set('ready');
    this._source.set(source);
  }

  private writeSaved(city: CatalogCity): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(city));
    } catch {
      // Storage blocked
    }
  }
}
