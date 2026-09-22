import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed, inject, OnInit } from '@angular/core';
import { AdminPage } from '../../../../admin/admin-page/admin-page';
import { PricingApiService, type FareRule } from '../../../../core/trips/pricing-api.service';

@Component({
  selector: 'md-pricing',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './pricing.html',
  styleUrl: '../../masters/masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Pricing implements OnInit {
  private readonly api = inject(PricingApiService);
  readonly list = signal<FareRule[]>([]);
  readonly loading = signal(false);
  readonly showAddForm = signal(false);
  readonly editingId = signal<string | 'new' | null>(null);

  // Form Signals
  readonly inputVehicle = signal('Sedan');
  readonly inputTripType = signal('One Way');
  readonly inputZone = signal('Delhi NCR');
  readonly inputBaseFare = signal(50);
  readonly inputPerKm = signal(12);
  readonly inputPerMin = signal(1.5);
  readonly inputWaitingCharge = signal(2);
  readonly inputMinFare = signal(100);
  readonly inputDriverAllowance = signal(250);
  readonly inputTollIncluded = signal(false);
  readonly inputSurgeMultiplier = signal(1.0);
  readonly inputEffectiveFrom = signal(new Date().toISOString().slice(0, 10));
  readonly inputIsActive = signal(true);

  // Master Options
  readonly vehicleCategories = signal<string[]>(['Sedan', 'Hatchback', 'SUV', 'Luxury', 'Auto', 'Bike']);
  readonly tripTypeOptions = signal<string[]>(['One Way', 'Round Trip', 'Local (Hourly)', 'Outstation', 'Airport', 'Rental']);
  readonly zoneOptions = signal<string[]>(['Platform Wide (All Zones)', 'Delhi NCR', 'Mumbai Metro', 'Bengaluru Urban', 'Hyderabad Region']);

  readonly tableColumns = JSON.stringify([
    { key: 'vehicle_category_name', label: 'Vehicle', sortable: true },
    { key: 'trip_type_name', label: 'Trip Type', sortable: true },
    { key: 'zone_name', label: 'Zone', sortable: true },
    { key: 'base_fare', label: 'Base (₹)', sortable: true },
    { key: 'per_km_rate', label: 'Per Km (₹)', sortable: true },
    { key: 'min_fare', label: 'Min Fare (₹)', sortable: true },
    { key: 'driver_allowance', label: 'Driver Allowance', sortable: true },
    { key: 'waiting_charge_per_min', label: 'Waiting Charge/min', sortable: true },
    { key: 'toll_included_label', label: 'Toll Included', type: 'status', statusMap: { Yes: 'success', No: 'neutral' } },
    { key: 'surge_multiplier', label: 'Surge', sortable: true },
    { key: 'effective_from', label: 'Effective From', sortable: true },
    { key: 'status_label', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } },
  ]);
  readonly tableActions = JSON.stringify([
    { icon: 'edit', label: 'Edit', event: 'edit_option' },
    { icon: 'delete', label: 'Delete', event: 'delete_option', variant: 'danger' },
  ]);
  readonly tableRowsString = computed(() =>
    JSON.stringify(
      this.list().map((r) => ({
        ...r,
        toll_included_label: r.toll_included ? 'Yes' : 'No',
        status_label: r.is_active ? 'Active' : 'Inactive',
      }))
    )
  );

  ngOnInit(): void {
    this.reload();
  }

  private reload(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (data) => {
        this.list.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load fare rules', err);
        this.loading.set(false);
      },
    });
  }

  onRowAction(event: Event): void {
    const detail = (event as CustomEvent).detail;
    if (detail.action === 'edit_option') this.startEdit(detail.row);
    else if (detail.action === 'delete_option') this.deleteOption(detail.row);
  }

  startAdd(): void {
    this.editingId.set('new');
    this.inputVehicle.set('Sedan');
    this.inputTripType.set('One Way');
    this.inputZone.set('Delhi NCR');
    this.inputBaseFare.set(50);
    this.inputPerKm.set(12);
    this.inputPerMin.set(1.5);
    this.inputWaitingCharge.set(2);
    this.inputMinFare.set(100);
    this.inputDriverAllowance.set(250);
    this.inputTollIncluded.set(false);
    this.inputSurgeMultiplier.set(1.0);
    this.inputEffectiveFrom.set(new Date().toISOString().slice(0, 10));
    this.inputIsActive.set(true);
    this.showAddForm.set(true);
  }

  startEdit(row: FareRule): void {
    this.editingId.set(row.id || null);
    this.inputVehicle.set(row.vehicle_category_name);
    this.inputTripType.set(row.trip_type_name);
    this.inputZone.set(row.zone_name);
    this.inputBaseFare.set(row.base_fare);
    this.inputPerKm.set(row.per_km_rate);
    this.inputPerMin.set(row.per_min_rate);
    this.inputWaitingCharge.set(row.waiting_charge_per_min);
    this.inputMinFare.set(row.min_fare);
    this.inputDriverAllowance.set(row.driver_allowance);
    this.inputTollIncluded.set(row.toll_included);
    this.inputSurgeMultiplier.set(row.surge_multiplier);
    this.inputEffectiveFrom.set(row.effective_from);
    this.inputIsActive.set(row.is_active);
    this.showAddForm.set(true);
  }

  saveOption(): void {
    const payload: FareRule = {
      vehicle_category_name: this.inputVehicle(),
      trip_type_name: this.inputTripType(),
      zone_name: this.inputZone(),
      base_fare: Number(this.inputBaseFare()),
      per_km_rate: Number(this.inputPerKm()),
      per_min_rate: Number(this.inputPerMin()),
      waiting_charge_per_min: Number(this.inputWaitingCharge()),
      min_fare: Number(this.inputMinFare()),
      driver_allowance: Number(this.inputDriverAllowance()),
      toll_included: Boolean(this.inputTollIncluded()),
      surge_multiplier: Number(this.inputSurgeMultiplier()),
      effective_from: this.inputEffectiveFrom(),
      is_active: Boolean(this.inputIsActive()),
    };
    const id = this.editingId();
    const request = id === 'new' || id === null ? this.api.create(payload) : this.api.update(id, payload);
    request.subscribe({
      next: () => {
        this.reload();
        this.cancelEdit();
      },
      error: (err) => {
        console.error('Failed to save fare rule', err);
        alert('Failed to save fare rule. Please try again.');
      },
    });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.showAddForm.set(false);
  }

  deleteOption(row: FareRule): void {
    if (confirm(`Delete fare rule for "${row.vehicle_category_name} (${row.trip_type_name})"?`) && row.id) {
      this.api.delete(row.id).subscribe({
        next: () => this.reload(),
        error: (err) => {
          console.error('Failed to delete fare rule', err);
          alert('Failed to delete fare rule. Please try again.');
        },
      });
    }
  }
}
