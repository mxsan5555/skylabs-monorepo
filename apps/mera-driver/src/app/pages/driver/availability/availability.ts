import { Component, CUSTOM_ELEMENTS_SCHEMA, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AdminPage } from '../../../admin/admin-page/admin-page';
import { DriverWorkflowApiService, type DriverWorkflowOverview } from '../../../core/drivers/driver-workflow-api.service';
import { DriverSelfApiService } from '../../../core/drivers/driver-self-api.service';
import { httpErrorMessage } from '../../../core/http-error';

/** Don't push a location update more often than this, even if the browser reports movement
 *  faster — bounds both network chatter and the backend's own rate limit. */
const MIN_PUSH_INTERVAL_MS = 20000;

@Component({
  selector: 'md-driver-availability',
  imports: [AdminPage, DatePipe],
  templateUrl: './availability.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DriverAvailability implements OnInit, OnDestroy {
  private readonly workflow = inject(DriverWorkflowApiService);
  private readonly api = inject(DriverSelfApiService);

  protected readonly overview = signal<DriverWorkflowOverview | null>(null);
  protected readonly loading = signal(true);
  protected readonly toggling = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly locationStatus = signal<'idle' | 'sharing' | 'denied' | 'unsupported'>('idle');
  protected readonly lastLocationSentAt = signal<Date | null>(null);

  protected readonly online = computed(() => this.overview()?.driver.online ?? false);
  protected readonly eligible = computed(() => (this.overview()?.reasons.length ?? 1) === 0);
  protected readonly blockers = computed(() => this.overview()?.reasons ?? []);

  private watchId: number | null = null;
  private lastPushAt = 0;

  constructor() {
    // Only an online driver's position is worth sharing — stop watching the moment they go
    // offline rather than leaving a geolocation watch (and battery drain) running silently.
    effect(() => {
      if (this.online()) this.startSharingLocation();
      else this.stopSharingLocation();
    });
  }

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.stopSharingLocation();
  }

  private load(): void {
    this.loading.set(true);
    this.workflow.overview().subscribe({
      next: o => { this.overview.set(o); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  protected toggle(): void {
    if (this.toggling()) return;
    this.toggling.set(true);
    this.error.set(null);
    this.workflow.setAvailability(!this.online()).subscribe({
      next: () => { this.toggling.set(false); this.load(); },
      error: async e => { this.toggling.set(false); this.error.set(await httpErrorMessage(e)); },
    });
  }

  private startSharingLocation(): void {
    if (this.watchId != null) return;
    if (!('geolocation' in navigator)) { this.locationStatus.set('unsupported'); return; }
    this.watchId = navigator.geolocation.watchPosition(
      position => {
        this.locationStatus.set('sharing');
        const now = Date.now();
        if (now - this.lastPushAt < MIN_PUSH_INTERVAL_MS) return;
        this.lastPushAt = now;
        this.api.updateLocation(position.coords.latitude, position.coords.longitude).subscribe({
          next: () => this.lastLocationSentAt.set(new Date()),
          error: () => { /* a missed push just retries on the next watchPosition tick */ },
        });
      },
      () => this.locationStatus.set('denied'),
      { enableHighAccuracy: false, maximumAge: 15000, timeout: 20000 },
    );
  }

  private stopSharingLocation(): void {
    if (this.watchId != null) { navigator.geolocation.clearWatch(this.watchId); this.watchId = null; }
    this.locationStatus.set('idle');
  }
}
