import { AuthService } from '@skylabs-monorepo/shared-auth/angular';
import { Injectable, computed, signal, inject, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import type {
  Booking,
  DriverSummary,
  PaymentMethod,
  Place,
  RideOption,
  TripType,
} from '../../models';
/** Keeps the website's in-progress selections across its existing routed steps.
 * Available services come from active backend fare rules. Assignment and payment
 * are confirmed through the owned customer booking workflow. */
@Injectable({ providedIn: 'root' })
export class BookingService {
  // Address suggestions remain empty until a real source is configured.
  readonly savedPlaces: Place[] = [];
  readonly recentPlaces: Place[] = [];
  readonly rideOptions = signal<RideOption[]>([]);

  // Trip shape chosen on the landing hero.
  private readonly _tripType = signal<TripType>('one-way');
  /** 'now' or an ISO datetime string for a scheduled pickup. */
  private readonly _schedule = signal<string>('now');

  // In-progress selection.
  private readonly _pickup = signal<Place | null>(null);
  private readonly _drop = signal<Place | null>(null);
  private readonly _ride = signal<RideOption | null>(null);
  private readonly _driver = signal<DriverSummary | null>(null);
  private readonly _payment = signal<PaymentMethod | null>(null);
  private readonly _drivers = signal<DriverSummary[]>([]);
  private readonly _methods = signal<PaymentMethod[]>([]);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private previousUser: string | null | undefined;
  constructor(){effect(() => {
    const id = this.auth.bootstrap()?.user.id ?? null;
    if (this.previousUser !== undefined && this.previousUser !== id) { this.reset(); this._pickup.set(null); this._payment.set(null); this._drivers.set([]); this._methods.set([]); }
    this.previousUser = id;
  });this.http.get<{data:{id:string;zoneName:string;tripTypeName:string;vehicleCategoryName:string;minFare:number;baseFare:number}[]}>(`${environment.apiUrl}/workflow/catalog`).subscribe({next:r=>this.rideOptions.set(r.data.map(rule=>{
    const name=rule.tripTypeName.toLowerCase();const category=name.includes('outstation')?'outstation':/monthly|long.term/.test(name)?'monthly':/language|special/.test(name)?'language':/hour|day|package|short.term/.test(name)?'package':'car';
    return {id:rule.id,category,title:rule.tripTypeName,subtitle:`${rule.zoneName} · ${rule.vehicleCategoryName} · Final price calculated before booking`,icon:'directions_car',etaMinutes:0,priceINR:Math.max(rule.minFare,rule.baseFare),seats:0};
  })),error:()=>this.rideOptions.set([])});}

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
