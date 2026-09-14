import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, computed, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AdminPage } from '../../../../admin/admin-page/admin-page';

interface FareRule {
  id?: string;
  vehicle_category_name: string;
  trip_type_name: string;
  zone_name: string;
  base_fare: number;
  per_km_rate: number;
  per_min_rate: number;
  waiting_charge_per_min: number;
  min_fare: number;
  driver_allowance: number;
  toll_included: boolean;
  surge_multiplier: number;
  effective_from: string;
  is_active: boolean;
}

@Component({
  selector: 'md-pricing',
  standalone: true,
  imports: [AdminPage],
  templateUrl: './pricing.html',
  styleUrl: '../../masters/masters.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Pricing implements OnInit {
  private readonly http = inject(HttpClient);
  readonly list = signal<FareRule[]>([]);
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
    this.http.get<FareRule[]>('data/fare_rules.json').subscribe({
      next: (data) => {
        if (data) {
          const mapped = data.map((item: any) => ({
            id: String(item.id || 'fr-' + Math.random()),
            vehicle_category_name: item.vehicle_category_name || item.vehicle_category || 'Sedan',
            trip_type_name: item.trip_type_name || item.trip_type || 'One Way',
            zone_name: item.zone_name || item.zone || 'Delhi NCR',
            base_fare: Number(item.base_fare || 50),
            per_km_rate: Number(item.per_km_rate || 12),
            per_min_rate: Number(item.per_min_rate || 1.5),
            waiting_charge_per_min: Number(item.waiting_charge_per_min || 2),
            min_fare: Number(item.min_fare || 100),
            driver_allowance: Number(item.driver_allowance || 0),
            toll_included: Boolean(item.toll_included),
            surge_multiplier: Number(item.surge_multiplier || 1.0),
            effective_from: item.effective_from || '2026-08-01',
            is_active: item.is_active !== undefined ? Boolean(item.is_active) : item.status === 'Active',
          }));
          this.list.set(mapped);
        }
      },
      error: (err) => console.error('Failed to load fare rules', err),
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
    const id = this.editingId();
    const record: FareRule = {
      id: id === 'new' ? 'fr-' + Date.now() : id!,
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
    if (id === 'new') this.list.update((l) => [...l, record]);
    else this.list.update((l) => l.map((x) => (x.id === id ? record : x)));
    this.cancelEdit();
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.showAddForm.set(false);
  }

  deleteOption(row: FareRule): void {
    if (confirm(`Delete fare rule for "${row.vehicle_category_name} (${row.trip_type_name})"?`)) {
      this.list.update((l) => l.filter((x) => x.id !== row.id));
    }
  }
}
