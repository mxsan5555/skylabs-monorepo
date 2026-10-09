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
import { haversineKm } from '../../models';
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
  /** sessionStorage (not localStorage): survives reload/login-redirect within the tab but
   *  never leaks a draft across browser sessions or devices. */
  private static readonly DRAFT_KEY = 'mera_driver_ride_draft_v1';
  constructor(){
    this.restoreDraft();
    effect(() => {
      const id = this.auth.bootstrap()?.user.id ?? null;
      // A guest signing in mid-booking (previousUser null -> id) must NOT wipe the draft —
      // that's the exact continuity the booking flow requires. Only an actual account switch
      // (one signed-in user -> a different one) or sign-out clears it, since a shared device
      // should not carry one account's draft into another's session.
      if (this.previousUser !== undefined && this.previousUser !== id && this.previousUser !== null) {
        this.reset(); this._pickup.set(null); this._payment.set(null); this._drivers.set([]); this._methods.set([]);
        this.clearDraft();
      }
      this.previousUser = id;
    });
    effect(() => this.persistDraft());
    this.http.get<{data:{id:string;zoneName:string;tripTypeName:string;vehicleCategoryName:string;minFare:number;baseFare:number}[]}>(`${environment.apiUrl}/workflow/catalog`).subscribe({next:r=>this.rideOptions.set(r.data.map(rule=>{
    const name=rule.tripTypeName.toLowerCase();const category=name.includes('outstation')?'outstation':/monthly|long.term/.test(name)?'monthly':/language|special/.test(name)?'language':/hour|day|package|short.term/.test(name)?'package':'car';
    return {id:rule.id,category,title:rule.tripTypeName,subtitle:`${rule.zoneName} · ${rule.vehicleCategoryName} · Final price calculated before booking`,icon:'directions_car',etaMinutes:0,priceINR:Math.max(rule.minFare,rule.baseFare),seats:0,zoneName:rule.zoneName,vehicleCategoryName:rule.vehicleCategoryName};
  })),error:()=>this.rideOptions.set([])});
  }

  /** Restores a draft (pickup/drop/ride/driver/payment/trip-shape) saved before a reload or
   *  a login redirect. Never restores a submitted booking — only the in-progress selection. */
  private restoreDraft(): void {
    try {
      const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(BookingService.DRAFT_KEY) : null;
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        pickup?: Place | null; drop?: Place | null; ride?: RideOption | null;
        driver?: DriverSummary | null; payment?: PaymentMethod | null;
        tripType?: TripType; schedule?: string;
      };
      if (draft.pickup) this._pickup.set(draft.pickup);
      if (draft.drop) this._drop.set(draft.drop);
      if (draft.ride) this._ride.set(draft.ride);
      if (draft.driver) this._driver.set(draft.driver);
      if (draft.payment) this._payment.set(draft.payment);
      if (draft.tripType) this._tripType.set(draft.tripType);
      if (draft.schedule) this._schedule.set(draft.schedule);
    } catch { /* corrupt or unavailable storage is ignored — the flow just starts fresh */ }
  }

  private persistDraft(): void {
    const draft = {
      pickup: this._pickup(), drop: this._drop(), ride: this._ride(),
      driver: this._driver(), payment: this._payment(),
      tripType: this._tripType(), schedule: this._schedule(),
    };
    try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(BookingService.DRAFT_KEY, JSON.stringify(draft)); } catch { /* storage unavailable (private mode / quota) is non-fatal */ }
  }

  private clearDraft(): void {
    try { if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(BookingService.DRAFT_KEY); } catch { /* ignored */ }
  }

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

  selectDriver(driver: DriverSummary | null): void {
    this._driver.set(driver);
  }

  readonly loadingDrivers = signal(false);
  readonly driversError = signal<string | null>(null);
  /** Real, Super-Admin-managed language master (`/workflow/public/languages`) — drives the
   *  language filter chips below without inventing a hardcoded list. */
  readonly languageOptions = signal<string[]>([]);
  /** Languages the rider has selected to filter eligible drivers by (AND match — every
   *  selected language must be among a driver's saved languages). Empty = no filter. */
  private readonly _languageFilter = signal<string[]>([]);
  readonly languageFilter = this._languageFilter.asReadonly();

  loadLanguageOptions(): void {
    if (this.languageOptions().length) return;
    this.http.get<{ data: string[] }>(`${environment.apiUrl}/workflow/public/languages`)
      .subscribe({ next: r => this.languageOptions.set(r.data), error: () => this.languageOptions.set([]) });
  }

  toggleLanguageFilter(language: string): void {
    this._languageFilter.update(list => list.includes(language) ? list.filter(l => l !== language) : [...list, language]);
    this.loadCandidates();
  }

  /** Fetches real, eligible drivers for the current pickup/drop/ride/schedule (and, if set,
   *  language filter) from the public (no-login) candidates endpoint — the same matching/
   *  eligibility engine the authenticated customer flow uses, just without requiring a
   *  session yet. */
  loadCandidates(): void {
    const pickup = this._pickup(), drop = this._drop(), ride = this._ride();
    if (!pickup || !drop || !ride) return;
    this.loadingDrivers.set(true);
    this.driversError.set(null);
    const schedule = this._schedule();
    const startsAt = schedule === 'now' ? new Date(Date.now() + 5 * 60000).toISOString() : schedule;
    const body = {
      city: ride.zoneName, service: ride.title, vehicleCategory: ride.vehicleCategoryName,
      pickupAddress: pickup.address, dropAddress: drop.address, startsAt,
      durationMinutes: 60, distanceKm: Math.round(haversineKm(pickup.coord, drop.coord) * 10) / 10,
      pickupLat: pickup.coord.lat, pickupLng: pickup.coord.lng, dropLat: drop.coord.lat, dropLng: drop.coord.lng,
      ...(this._languageFilter().length ? { languages: this._languageFilter() } : {}),
    };
    this.http.post<{ data: { id: string; name: string; city: string | null; driverType: string | null; avatar: string | null; languages: string[] | null; experience: string | null; reasons: string[] }[] }>(
      `${environment.apiUrl}/workflow/public/candidates`, body,
    ).subscribe({
      next: r => {
        this.loadingDrivers.set(false);
        this._drivers.set(r.data.map(d => ({ id: d.id, name: d.name.trim(), photo: d.avatar, vehicle: d.driverType ?? 'Driver', languages: d.languages ?? [], experience: d.experience, bookmarked: false })));
      },
      error: () => { this.loadingDrivers.set(false); this.driversError.set('Unable to load available drivers right now.'); this._drivers.set([]); },
    });
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
