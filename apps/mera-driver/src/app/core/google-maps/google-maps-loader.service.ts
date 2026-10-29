import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

declare global {
  interface Window {
    // No @types/google.maps in this workspace — matches the existing declaration in
    // pages/location/location.ts (must stay identical; TS merges global augmentations
    // and rejects conflicting modifiers across files).
    google: any;
  }
}

/**
 * Loads the Google Maps JS API script (Maps JavaScript API + Places + Geometry) exactly
 * once, however many map/autocomplete components mount. Every caller awaits the same
 * promise, so `window.google.maps` is guaranteed ready when it resolves.
 *
 * Degrades gracefully when no key is configured (e.g. a production build that hasn't set
 * one yet) — callers get a rejected promise and are expected to fall back to manual address
 * entry, never to silently pretend the map/autocomplete loaded.
 */
@Injectable({ providedIn: 'root' })
export class GoogleMapsLoaderService {
  private loadPromise: Promise<any> | null = null;

  load(): Promise<any> {
    if (window.google?.maps) return Promise.resolve(window.google);
    if (this.loadPromise) return this.loadPromise;

    const key = environment.googleMapsApiKey;
    if (!key) {
      return Promise.reject(new Error('Google Maps API key is not configured for this environment.'));
    }

    this.loadPromise = new Promise((resolve, reject) => {
      const callbackName = '__meraDriverGoogleMapsReady';
      (window as unknown as Record<string, () => void>)[callbackName] = () => {
        if (window.google?.maps) resolve(window.google);
        else reject(new Error('Google Maps script loaded but window.google.maps is unavailable.'));
      };
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&callback=${callbackName}&loading=async`;
      script.async = true;
      script.defer = true;
      script.onerror = () => reject(new Error('Unable to load the Google Maps script.'));
      document.head.appendChild(script);
    });
    return this.loadPromise;
  }
}
