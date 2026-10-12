import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LocationService } from '../../../core/location/location.service';

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
  private readonly locationService = inject(LocationService);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);

  protected async allow(): Promise<void> {
    this.busy.set(true);
    await this.locationService.requestBrowser();
    this.finish();
  }

  protected skip(): void {
    this.finish();
  }

  private finish(): void {
    this.busy.set(false);
    this.router.navigate(['/ride']);
  }
}
