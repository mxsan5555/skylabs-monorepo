import { Injectable, computed, signal } from '@angular/core';
import type {
  Booking,
  DriverSummary,
  PaymentMethod,
  Place,
  RideOption,
  TripType,
} from '../../models';
import {
  DEFAULT_PICKUP,
  DRIVERS,
  PAYMENT_METHODS,
  RECENT_PLACES,
  RIDE_OPTIONS,
  SAVED_PLACES,
} from './mock-data';

/**
 * Holds the in-progress booking as the rider moves through the flow
 * (home → choose ride → choose driver → verify → payment → confirmed).
 *
 * Signals mirror the auth service style. Data is mock today; when the
 * mera-driver API lands these setters call HTTP instead. The service is a
 * singleton so state survives navigation between the routed steps.
 */
@Injectable({ providedIn: 'root' })
export class BookingService {
  // Reference data (static mock lists exposed read-only).
  readonly savedPlaces = SAVED_PLACES;
  readonly recentPlaces = RECENT_PLACES;
  readonly rideOptions = RIDE_OPTIONS;

  // Trip shape chosen on the landing hero.
  private readonly _tripType = signal<TripType>('one-way');
  /** 'now' or an ISO datetime string for a scheduled pickup. */
  private readonly _schedule = signal<string>('now');

  // In-progress selection.
  private readonly _pickup = signal<Place | null>(DEFAULT_PICKUP);
  private readonly _drop = signal<Place | null>(null);
  private readonly _ride = signal<RideOption | null>(null);
  private readonly _driver = signal<DriverSummary | null>(null);
  private readonly _payment = signal<PaymentMethod | null>(
    PAYMENT_METHODS.find((m) => !m.expired) ?? null,
  );
  private readonly _drivers = signal<DriverSummary[]>(DRIVERS);
  private readonly _methods = signal<PaymentMethod[]>(PAYMENT_METHODS);

  readonly tripType = this._tripType.asReadonly();
  readonly schedule = this._schedule.asReadonly();
  readonly pickup = this._pickup.asReadonly();
  readonly drop = this._drop.asReadonly();
  readonly ride = this._ride.asReadonly();
  readonly driver = this._driver.asReadonly();
  readonly payment = this._payment.asReadonly();
  readonly drivers = this._drivers.asReadonly();
  readonly methods = this._methods.asReadonly();

  /** True once the rider has both endpoints set. */
  readonly hasRoute = computed(
    () => this._pickup() !== null && this._drop() !== null,
  );

  /** The assembled booking (for the confirmation screen). */
  readonly booking = computed<Booking>(() => ({
    pickup: this._pickup(),
    drop: this._drop(),
    ride: this._ride(),
    driver: this._driver(),
    payment: this._payment(),
    status: 'draft',
  }));

  setTripType(type: TripType): void {
    this._tripType.set(type);
  }

  setSchedule(when: string): void {
    this._schedule.set(when);
  }

  setPickup(place: Place | null): void {
    this._pickup.set(place);
  }

  setDrop(place: Place | null): void {
    this._drop.set(place);
  }

  selectRide(ride: RideOption): void {
    this._ride.set(ride);
  }

  selectDriver(driver: DriverSummary): void {
    this._driver.set(driver);
  }

  selectPayment(method: PaymentMethod): void {
    if (method.expired) return;
    this._payment.set(method);
  }

  /** Toggle a driver's bookmark (persists to the drivers list + selection). */
  toggleBookmark(id: string): void {
    this._drivers.update((list) =>
      list.map((d) =>
        d.id === id ? { ...d, bookmarked: !d.bookmarked } : d,
      ),
    );
    const current = this._driver();
    if (current?.id === id) {
      this._driver.set({ ...current, bookmarked: !current.bookmarked });
    }
  }

  /** Clear the selection after a booking completes. */
  reset(): void {
    this._drop.set(null);
    this._ride.set(null);
    this._driver.set(null);
  }
}
