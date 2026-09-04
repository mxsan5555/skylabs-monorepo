import {
  AfterViewInit,
  Component,
  ElementRef,
  OnChanges,
  OnDestroy,
  ViewChild,
  input,
} from '@angular/core';
import * as L from 'leaflet';
import type { LatLng } from '../../models';

/**
 * Leaflet + OpenStreetMap map for the booking screens. App-local (not shared-ui):
 * it's specific to mera-driver's rider flow and pulls in Leaflet. Draws a pickup
 * pin, a drop pin, and the route line between them, then fits the view to both.
 *
 * Default Leaflet marker images don't resolve through the app bundler, so pins
 * are `divIcon`s styled in CSS — no image assets to load. Runs browser-only
 * (init in ngAfterViewInit), so it's safe under a plain SPA build.
 */
@Component({
  selector: 'md-ride-map',
  template: `<div #map class="ride-map" role="img" [attr.aria-label]="label()"></div>`,
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
      /* divIcon pins — a colored dot with a soft ring. */
      :host ::ng-deep .ride-pin {
        display: grid;
        place-items: center;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        border: 3px solid var(--md-sys-color-surface, #fff);
        box-shadow: 0 1px 4px rgb(0 0 0 / 0.35);
      }
      :host ::ng-deep .ride-pin--pickup {
        background: var(--md-sys-color-primary, #33618d);
      }
      :host ::ng-deep .ride-pin--drop {
        background: var(--md-sys-color-error, #ba1a1a);
      }
      /* Match the route/controls to the app's brand. */
      :host ::ng-deep .leaflet-control-zoom a {
        color: var(--md-sys-color-on-surface, #1a1c1e);
      }
    `,
  ],
})
export class RideMap implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('map', { static: true }) private mapEl!: ElementRef<HTMLElement>;

  readonly pickup = input<LatLng | null>(null);
  readonly drop = input<LatLng | null>(null);
  readonly label = input<string>('Map of the trip route');

  private map?: L.Map;
  private pickupMarker?: L.Marker;
  private dropMarker?: L.Marker;
  private route?: L.Polyline;

  ngAfterViewInit(): void {
    const start = this.pickup() ?? { lat: 12.9716, lng: 77.5946 };
    this.map = L.map(this.mapEl.nativeElement, {
      center: [start.lat, start.lng],
      zoom: 13,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(this.map);

    this.render();
  }

  ngOnChanges(): void {
    if (this.map) this.render();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  /** (Re)draw pins + route and fit the view to whatever endpoints are set. */
  private render(): void {
    if (!this.map) return;
    const pickup = this.pickup();
    const drop = this.drop();

    this.pickupMarker?.remove();
    this.dropMarker?.remove();
    this.route?.remove();

    if (pickup) {
      this.pickupMarker = L.marker([pickup.lat, pickup.lng], {
        icon: pinIcon('pickup'),
        keyboard: false,
      }).addTo(this.map);
    }
    if (drop) {
      this.dropMarker = L.marker([drop.lat, drop.lng], {
        icon: pinIcon('drop'),
        keyboard: false,
      }).addTo(this.map);
    }

    if (pickup && drop) {
      const points: L.LatLngExpression[] = [
        [pickup.lat, pickup.lng],
        [drop.lat, drop.lng],
      ];
      this.route = L.polyline(points, {
        color: cssColor('--md-sys-color-primary', '#33618d'),
        weight: 5,
        opacity: 0.9,
      }).addTo(this.map);
      this.map.fitBounds(this.route.getBounds(), { padding: [56, 56] });
    } else if (pickup) {
      this.map.setView([pickup.lat, pickup.lng], 14);
    }
  }
}

function pinIcon(kind: 'pickup' | 'drop'): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<span class="ride-pin ride-pin--${kind}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

/** Read a themed CSS custom property (Leaflet needs a real color string). */
function cssColor(varName: string, fallback: string): string {
  if (typeof getComputedStyle === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  return v || fallback;
}
