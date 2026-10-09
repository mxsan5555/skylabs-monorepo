import { ActivatedRoute } from '@angular/router';
import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AdminPage } from '../../../admin/admin-page/admin-page';
import { DriverWorkflowApiService, type WorkflowBooking } from '../../../core/drivers/driver-workflow-api.service';
import { httpErrorMessage } from '../../../core/http-error';
import { money } from '../money';

const GROUPS = {
  Upcoming: ['requested', 'confirmed'],
  Active: ['on_the_way', 'arrived', 'in_progress'],
  Completed: ['completed'],
  Cancelled: ['cancelled'],
} as const;

const NEXT_STATUS: Record<string, string> = { confirmed: 'on_the_way', on_the_way: 'arrived', arrived: 'in_progress', in_progress: 'completed' };

@Component({
  selector: 'md-driver-trips',
  imports: [AdminPage, DatePipe],
  templateUrl: './trips.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DriverTrips implements OnInit {
  private readonly route=inject(ActivatedRoute);
  private readonly workflow = inject(DriverWorkflowApiService);
  protected readonly money = money;
  protected readonly groupNames = Object.keys(GROUPS) as (keyof typeof GROUPS)[];

  protected readonly trips = signal<WorkflowBooking[]>([]);
  protected readonly loading = signal(true);
  protected readonly view = signal<keyof typeof GROUPS>('Upcoming');
  protected readonly updating = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly visible = computed(() => {
    const scheduled=this.view()==='Upcoming'&&this.route.snapshot.queryParamMap.get('timing')==='upcoming';
    const statuses: readonly string[] = scheduled?['confirmed','on_the_way','arrived']:GROUPS[this.view()];
    return this.trips().filter(t => statuses.includes(t.status)&&(!scheduled||(t.startsAt&&Date.parse(t.startsAt)>=Date.now())));
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.workflow.overview().subscribe({
      next: o => { this.trips.set(o.trips); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  protected nextStatus(trip: WorkflowBooking): string | undefined {
    return NEXT_STATUS[trip.status];
  }

  protected advance(trip: WorkflowBooking): void {
    const next = this.nextStatus(trip);
    if (!next || this.updating()) return;
    // Entering `in_progress` requires the customer-shared OTP (`transitionTrip`'s existing check) —
    // same confirmation pattern this app already uses for other sensitive actions.
    let otp: string | undefined;
    if (next === 'in_progress') {
      otp = prompt('Enter the trip OTP shared by the customer to start this trip:')?.trim();
      if (!otp) return;
    }
    this.updating.set(trip.id);
    this.error.set(null);
    this.workflow.transitionTripStatus(trip.id, { status: next, otp }).subscribe({
      next: () => { this.updating.set(null); this.load(); },
      error: async e => { this.updating.set(null); this.error.set(await httpErrorMessage(e)); },
    });
  }

  protected cancel(trip: WorkflowBooking): void {
    if (this.updating()) return;
    const reason = prompt('Reason for cancelling this trip:')?.trim();
    if (!reason) return;
    this.updating.set(trip.id);
    this.error.set(null);
    this.workflow.transitionTripStatus(trip.id, { status: 'cancelled', reason }).subscribe({
      next: () => { this.updating.set(null); this.load(); },
      error: async e => { this.updating.set(null); this.error.set(await httpErrorMessage(e)); },
    });
  }

  protected statusLabel(status: string): string {
    return ({ requested: 'Finding a driver', confirmed: 'Confirmed', on_the_way: 'On the way', arrived: 'Arrived', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' } as Record<string, string>)[status] ?? status;
  }
}
