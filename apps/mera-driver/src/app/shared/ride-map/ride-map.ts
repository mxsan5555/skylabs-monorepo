import {
  AfterViewInit,
  Component,
  ElementRef,
  OnChanges,
  OnDestroy,
  ViewChild,
  inject,
  input,
  signal,
} from '@angular/core';
import { GoogleMapsLoaderService } from '../../core/google-maps/google-maps-loader.service';
import type { LatLng } from '../../models';

/**
 * Google Maps JS API map for the booking screens. App-local (not shared-ui): it's specific
 * to mera-driver's rider flow. Draws a pickup pin, a drop pin, and the real driving route
 * between them (via DirectionsService), then fits the view to both.
 *
 * Degrades to a plain placeholder (no crash, no fake map) if no API key is configured or
 * the script fails to load — never silently shows a blank/broken map.
 */
@Component({
  selector: 'md-ride-map',
  template: `
    <div #map class="ride-map" role="img" [attr.aria-label]="label()"></div>
    @if (loadFailed()) {
      <div class="ride-map-fallback">
        <p>Map unavailable. Addresses can still be entered manually.</p>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        position: absolute;
        inset: 0;
      }
      .ride-map {
        width: 100%;
        height: 100%;
        background: var(--md-sys-color-surface-container-low, #eef1f6);
      }
      .ride-map-fallback {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        text-align: center;
        padding: 16px;
        color: var(--md-sys-color-on-surface-variant, #44474a);
        background: var(--md-sys-color-surface-container-low, #eef1f6);
      }
    `,
  ],
})
export class RideMap implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('map', { static: true }) private mapEl!: ElementRef<HTMLElement>;

  readonly pickup = input<LatLng | null>(null);
  readonly drop = input<LatLng | null>(null);
  readonly label = input<string>('Map of the trip route');

  protected readonly loadFailed = signal(false);

  private readonly loader = inject(GoogleMapsLoaderService);
  private map?: any;
  private pickupMarker?: any;
  private dropMarker?: any;
  private directionsService?: any;
  private directionsRenderer?: any;
  private ready = false;
  private destroyed = false;

  async ngAfterViewInit(): Promise<void> {
    try {
      const google = await this.loader.load();
      if (this.destroyed) return;
      const start = this.pickup() ?? { lat: 12.9716, lng: 77.5946 };
      this.map = new google.maps.Map(this.mapEl.nativeElement, {
        center: start,
        zoom: 13,
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
      });
      this.directionsService = new google.maps.DirectionsService();
      this.directionsRenderer = new google.maps.DirectionsRenderer({
        map: this.map,
        suppressMarkers: true,
        polylineOptions: { strokeColor: cssColor('--md-sys-color-primary', '#33618d'), strokeWeight: 5, strokeOpacity: 0.9 },
      });
      this.ready = true;
      this.render();
    } catch {
      this.loadFailed.set(true);
    }
  }

  ngOnChanges(): void {
    if (this.ready) this.render();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.pickupMarker?.setMap(null);
    this.dropMarker?.setMap(null);
  }

  /** (Re)draw pins + route and fit the view to whatever endpoints are set. */
  private render(): void {
    if (!this.ready) return;
    const google = window.google;
    const pickup = this.pickup();
    const drop = this.drop();

    this.pickupMarker?.setMap(null);
    this.dropMarker?.setMap(null);
    this.directionsRenderer.setDirections({ routes: [] });

    if (pickup) {
      this.pickupMarker = new google.maps.Marker({ position: pickup, map: this.map, icon: pinIcon(google, 'pickup') });
    }
    if (drop) {
      this.dropMarker = new google.maps.Marker({ position: drop, map: this.map, icon: pinIcon(google, 'drop') });
    }

    if (pickup && drop) {
      this.directionsService.route(
        { origin: pickup, destination: drop, travelMode: google.maps.TravelMode.DRIVING },
        (result: any, status: string) => {
          if (status === 'OK' && result) this.directionsRenderer.setDirections(result);
          else {
            // No drivable route (or the Directions API isn't enabled for this key) — still
            // show both pins so the trip endpoints remain visible.
            const bounds = new google.maps.LatLngBounds();
            bounds.extend(pickup);
            bounds.extend(drop);
            this.map.fitBounds(bounds, 56);
          }
        },
      );
    } else if (pickup) {
      this.map.setCenter(pickup);
      this.map.setZoom(14);
    }
  }
}

function pinIcon(google: any, kind: 'pickup' | 'drop') {
  return {
    path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
    fillColor: kind === 'pickup' ? cssColor('--md-sys-color-primary', '#33618d') : cssColor('--md-sys-color-error', '#ba1a1a'),
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2,
    scale: 1.8,
    anchor: new google.maps.Point(12, 22),
  };
}

/** Read a themed CSS custom property (Google Maps needs a real color string). */
function cssColor(varName: string, fallback: string): string {
  if (typeof getComputedStyle === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || fallback;
}
