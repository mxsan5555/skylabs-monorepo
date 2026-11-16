import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BookingService } from '../../../core/booking/booking.service';
import type { DriverSummary } from '../../../models';

/**
 * "Choose a driver" step. Lists real, eligible drivers (name, photo, vehicle type — the
 * only public-safe fields this backend models) with a bookmark toggle. Selecting one
 * stores a *preferred* driver on the booking — the actually-assigned driver is still
 * decided by the normal offer/accept workflow once the booking is created.
 */
@Component({
  selector: 'md-ride-drivers',
  templateUrl: './drivers.html',
  styleUrl: './drivers.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class RideDrivers implements OnInit {
  protected readonly booking = inject(BookingService);
  private readonly router = inject(Router);

  protected readonly selectedId = signal<string | null>(null);

  ngOnInit(): void {
    this.booking.loadLanguageOptions();
    if (this.booking.drivers().length === 0) this.booking.loadCandidates();
  }

  protected toggleLanguage(language: string): void {
    this.booking.toggleLanguageFilter(language);
  }

  protected toggleBookmark(event: Event, id: string): void {
    event.stopPropagation();
    this.booking.toggleBookmark(id);
  }

  protected pick(driver: DriverSummary): void {
    this.selectedId.set(driver.id);
  }

  protected back(): void {
    this.router.navigate(['/ride/options']);
  }

  protected confirm(): void {
    const driver = this.booking
      .drivers()
      .find((d) => d.id === this.selectedId());
    if (!driver) return;
    this.booking.selectDriver(driver);
    this.router.navigate(['/ride/verify']);
  }

  /** No eligible drivers to show, or the rider simply has no preference — the booking still
   *  proceeds normally and is dispatched to whichever eligible driver accepts first. */
  protected continueWithoutPreference(): void {
    this.booking.selectDriver(null);
    this.router.navigate(['/ride/verify']);
  }
}
